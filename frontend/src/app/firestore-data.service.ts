import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { firebaseApp, firebaseAuth } from './firebase';
import type {
  AppUser,
  KeyAvailability,
  KeyMovement,
  KeyOccurrence,
  KeyRoomLink,
  KeyStatus,
  OperationalReport,
  PhysicalKey,
  Reservation,
  ReservationSyncStatus,
  ReservationSyncEvent,
  Room,
  UserRole,
} from './app';

interface MovementInput {
  readonly keyId: string;
  readonly roomId: string;
  readonly responsibleName: string;
  readonly responsibleIdentifier?: string;
  readonly actorName: string;
  readonly actorIdentifier?: string;
  readonly expectedReturnAt?: string;
  readonly notes?: string;
  readonly reservationExternalId?: string;
  readonly reservationResponsibleName?: string;
  readonly reservationResponsibleIdentifier?: string;
}

interface ReturnInput {
  readonly keyId: string;
  readonly actorName: string;
  readonly actorIdentifier?: string;
  readonly notes?: string;
}

interface OccurrenceInput {
  readonly keyId: string;
  readonly roomId?: string;
  readonly type: 'ocorrencia';
  readonly actorName: string;
  readonly actorIdentifier?: string;
  readonly notes: string;
}

interface UserRoleUpdate {
  readonly userId: string;
  readonly roles: readonly UserRole[];
}

const db = initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true });

function reservationMatchesRoom(room: Room, reservation: Reservation): boolean {
  const references = new Set([
    room.name,
    ...(room.externalRefs ?? []),
  ].map(normalizeReference));

  return references.has(normalizeReference(reservation.roomName)) ||
    (!!reservation.roomExternalId && references.has(normalizeReference(reservation.roomExternalId)));
}

function isInsideReservationWindow(
  reservation: Reservation,
  now: number,
  blockBeforeMs: number,
): boolean {
  const starts = new Date(reservation.startsAt).getTime();
  const ends = new Date(reservation.endsAt).getTime();
  return starts <= now + blockBeforeMs && ends > now;
}

function normalizeReference(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

@Injectable({ providedIn: 'root' })
export class FirestoreDataService {
  async getCurrentUserProfile(): Promise<AppUser | null> {
    const user = firebaseAuth.currentUser;
    if (!user) return null;
    const snapshot = await getDoc(doc(db, 'users', user.uid));
    return snapshot.exists()
      ? ({ id: snapshot.id, ...snapshot.data() } as AppUser)
      : null;
  }

  async ensureCurrentUserProfile(): Promise<AppUser | null> {
    const user = firebaseAuth.currentUser;
    if (!user || !user.email) return null;

    const profileRef = doc(db, 'users', user.uid);
    const snapshot = await getDoc(profileRef);
    const email = user.email.toLowerCase();
    const roles: readonly UserRole[] = email === 'jacsoncorrea@ifba.edu.br'
      ? ['admin']
      : ['jacsonlinux@gmail.com', 'willian.barboza@ifba.edu.br'].includes(email)
        ? ['portaria']
        : ['usuario'];
    const now = new Date().toISOString();
    const profile = {
      id: user.uid,
      displayName: user.displayName || undefined,
      email: user.email,
      roles,
      source: 'firebase',
      firstSeenAt: snapshot.exists() ? snapshot.data()['firstSeenAt'] : now,
      lastLoginAt: now,
      updatedAt: now,
    };

    if (!snapshot.exists() || snapshot.data()['roles']?.join(',') !== roles.join(',')) {
      await setDoc(profileRef, profile, { merge: true });
    } else {
      await setDoc(profileRef, { lastLoginAt: now, updatedAt: now }, { merge: true });
    }

    return profile as AppUser;
  }

  async listRooms(): Promise<readonly Room[]> {
    return this.readCollection<Room>('rooms');
  }

  async listKeys(): Promise<readonly PhysicalKey[]> {
    return this.readCollection<PhysicalKey>('keys');
  }

  async listKeyRoomLinks(): Promise<readonly KeyRoomLink[]> {
    return this.readCollection<KeyRoomLink>('key_room_links');
  }

  async listReservations(): Promise<readonly Reservation[]> {
    const reservations = await this.readCollection<Reservation>('reservations');
    return reservations
      .filter((reservation) => reservation.status !== 'absent')
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }

  async getSyncStatus(): Promise<ReservationSyncStatus | null> {
    const snapshot = await getDoc(doc(db, 'sync_status', 'current'));
    return snapshot.exists()
      ? (snapshot.data() as ReservationSyncStatus)
      : null;
  }

  async listMovements(): Promise<readonly KeyMovement[]> {
    const records = await this.readCollection<KeyMovement>('key_movements');
    return records
      .map((record) => this.withDerivedMovementStatus(record))
      .sort((left, right) => right.checkedOutAt.localeCompare(left.checkedOutAt));
  }

  async listOccurrences(): Promise<readonly KeyOccurrence[]> {
    const records = await this.readCollection<KeyOccurrence>('key_occurrences');
    return [...records].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }

  async listUsers(): Promise<readonly AppUser[]> {
    const users = await this.readCollection<AppUser>('users');
    return [...users].sort((left, right) =>
      (left.displayName ?? left.id).localeCompare(right.displayName ?? right.id),
    );
  }

  async listAvailability(options: { readonly includeReservations?: boolean } = {}): Promise<readonly KeyAvailability[]> {
    const includeReservations = options.includeReservations ?? true;
    const [rooms, keys, links, reservations, movements] = await Promise.all([
      this.listRooms(),
      this.listKeys(),
      this.listKeyRoomLinks(),
      includeReservations ? this.listReservations() : Promise.resolve([]),
      this.listMovements(),
    ]);
    return this.buildAvailability(rooms, keys, links, reservations, movements);
  }

  watchAvailability(
    options: { readonly includeReservations?: boolean },
    onNext: (records: readonly KeyAvailability[]) => void,
    onError: (error: unknown) => void,
  ): Unsubscribe {
    const includeReservations = options.includeReservations ?? true;
    let rooms: readonly Room[] = [];
    let keys: readonly PhysicalKey[] = [];
    let links: readonly KeyRoomLink[] = [];
    let reservations: readonly Reservation[] = [];
    let movements: readonly KeyMovement[] = [];
    const loaded = {
      rooms: false,
      keys: false,
      links: false,
      reservations: !includeReservations,
      movements: false,
    };
    const emit = () => {
      if (loaded.rooms && loaded.keys && loaded.links && loaded.reservations && loaded.movements) {
        onNext(this.buildAvailability(rooms, keys, links, reservations, movements));
      }
    };
    const unsubscriptions = [
      this.watchCollection<Room>('rooms', (records) => {
        rooms = records;
        loaded.rooms = true;
        emit();
      }, onError),
      this.watchCollection<PhysicalKey>('keys', (records) => {
        keys = records;
        loaded.keys = true;
        emit();
      }, onError),
      this.watchCollection<KeyRoomLink>('key_room_links', (records) => {
        links = records;
        loaded.links = true;
        emit();
      }, onError),
      this.watchMovements((records) => {
        movements = records;
        loaded.movements = true;
        emit();
      }, onError),
    ];

    if (includeReservations) {
      unsubscriptions.push(this.watchReservations((records) => {
        reservations = records;
        loaded.reservations = true;
        emit();
      }, onError));
    }

    return () => {
      for (const unsubscribe of unsubscriptions) {
        unsubscribe();
      }
    };
  }

  watchReservations(
    onNext: (records: readonly Reservation[]) => void,
    onError: (error: unknown) => void,
  ): Unsubscribe {
    return this.watchCollection<Reservation>('reservations', (records) => {
      onNext(
        records
          .filter((reservation) => reservation.status !== 'absent')
          .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
      );
    }, onError);
  }

  watchMovements(
    onNext: (records: readonly KeyMovement[]) => void,
    onError: (error: unknown) => void,
  ): Unsubscribe {
    return this.watchCollection<KeyMovement>('key_movements', (records) => {
      onNext(
        records
          .map((record) => this.withDerivedMovementStatus(record))
          .sort((left, right) => right.checkedOutAt.localeCompare(left.checkedOutAt)),
      );
    }, onError);
  }

  private buildAvailability(
    rooms: readonly Room[],
    keys: readonly PhysicalKey[],
    links: readonly KeyRoomLink[],
    reservations: readonly Reservation[],
    movements: readonly KeyMovement[],
  ): readonly KeyAvailability[] {
    const activeRooms = rooms.filter((room) => !room.disabledAt);
    const activeRoomIds = new Set(activeRooms.map((room) => room.id));
    const activeKeys = keys.filter((key) => !key.disabledAt);
    const activeKeyIds = new Set(activeKeys.map((key) => key.id));
    const activeLinks = links.filter(
      (link) =>
        !link.disabledAt &&
        activeRoomIds.has(link.roomId) &&
        activeKeyIds.has(link.keyId),
    );
    const openMovements = new Map(
      movements
        .filter((movement) => movement.status === 'retirada' || movement.status === 'atrasada')
        .map((movement) => [movement.keyId, movement]),
    );
    const now = Date.now();
    const blockBeforeMs = 30 * 60 * 1000;

    return activeKeys
      .map((key) => {
        const linkedRooms = activeLinks
          .filter((link) => link.keyId === key.id)
          .map((link) => activeRooms.find((room) => room.id === link.roomId))
          .filter((room): room is Room => !!room);
        const matchingReservations = reservations
          .filter((reservation) =>
            linkedRooms.some((room) => reservationMatchesRoom(room, reservation)),
          )
          .filter((reservation) =>
            ['active', 'changed', 'conflicted'].includes(reservation.status),
          )
          .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
        const blockingReservation = matchingReservations.find((reservation) => {
          return (
            isInsideReservationWindow(reservation, now, blockBeforeMs)
          );
        });
        const upcomingReservation = matchingReservations.find(
          (reservation) => new Date(reservation.startsAt).getTime() > now,
        );
        const attention = reservations.find((reservation) => {
          return (
            linkedRooms.some((room) => reservationMatchesRoom(room, reservation)) &&
            reservation.status === 'suspect_absent' &&
            isInsideReservationWindow(reservation, now, blockBeforeMs)
          );
        });
        const openMovement = openMovements.get(key.id);
        const status: KeyStatus = openMovement
          ? openMovement.status === 'atrasada' ? 'atrasada' : 'retirada'
          : blockingReservation
            ? 'bloqueada_por_reserva'
            : key.baseStatus;

        return {
          key,
          rooms: linkedRooms,
          status,
          blockingReservation: blockingReservation
            ? {
                externalId: blockingReservation.externalId,
                roomName: blockingReservation.roomName,
                startsAt: blockingReservation.startsAt,
                endsAt: blockingReservation.endsAt,
                status: blockingReservation.status,
                responsibleName: blockingReservation.responsibleName,
                responsibleIdentifier: blockingReservation.responsibleIdentifier,
              }
            : undefined,
          upcomingReservation: (blockingReservation ?? upcomingReservation)
            ? {
                externalId: (blockingReservation ?? upcomingReservation)!.externalId,
                roomName: (blockingReservation ?? upcomingReservation)!.roomName,
                startsAt: (blockingReservation ?? upcomingReservation)!.startsAt,
                endsAt: (blockingReservation ?? upcomingReservation)!.endsAt,
                status: (blockingReservation ?? upcomingReservation)!.status,
                responsibleName: (blockingReservation ?? upcomingReservation)!.responsibleName,
                responsibleIdentifier: (blockingReservation ?? upcomingReservation)!.responsibleIdentifier,
              }
            : undefined,
          activeMovement: openMovement
            ? {
                responsibleName: openMovement.responsibleName,
                responsibleIdentifier: openMovement.responsibleIdentifier,
                checkedOutByName: openMovement.checkedOutByName,
                checkedOutAt: openMovement.checkedOutAt,
                expectedReturnAt: openMovement.expectedReturnAt,
              }
            : undefined,
          reservationAttention: attention
            ? {
                externalId: attention.externalId,
                roomName: attention.roomName,
                startsAt: attention.startsAt,
                endsAt: attention.endsAt,
                status: 'suspect_absent' as const,
              }
            : undefined,
        } satisfies KeyAvailability;
      })
      .filter((item) => item.rooms.length > 0);
  }

  async registerWithdrawal(input: MovementInput): Promise<void> {
    const now = new Date().toISOString();
    const availability = await this.listAvailability();
    const selected = availability.find((item) => item.key.id === input.keyId);
    if (
      !selected ||
      !this.canWithdrawSelectedKey(selected, input) ||
      !selected.rooms.some((room) => room.id === input.roomId)
    ) {
      throw new Error('Chave indisponivel para retirada ou sala nao vinculada.');
    }
    const movementId = `km-${Date.now()}-${crypto.randomUUID()}`;
    const movementRef = doc(db, 'key_movements', movementId);
    const keyRef = doc(db, 'keys', input.keyId);
    const [keySnapshot, linksSnapshot] = await Promise.all([
      getDoc(keyRef),
      getDocs(query(collection(db, 'key_room_links'), where('keyId', '==', input.keyId))),
    ]);
    if (!keySnapshot.exists()) throw new Error('Chave nao encontrada.');
    if (!linksSnapshot.docs.some((item) =>
      item.data()['roomId'] === input.roomId && !item.data()['disabledAt'])) {
      throw new Error('Chave nao esta vinculada a sala informada.');
    }
    await runTransaction(db, async (transaction) => {
      const currentKey = await transaction.get(keyRef);
      const lockRef = doc(db, 'key_locks', input.keyId);
      const lock = await transaction.get(lockRef);
      if (!currentKey.exists() || currentKey.data()['disabledAt']) {
        throw new Error('Chave indisponivel para retirada.');
      }
      if (lock.exists()) {
        throw new Error('Chave ja esta retirada.');
      }
      transaction.set(lockRef, {
        keyId: input.keyId,
        movementId,
        checkedOutAt: now,
        actorUid: firebaseAuth.currentUser?.uid,
      });
      transaction.set(movementRef, {
        id: movementId,
        keyId: input.keyId,
        roomId: input.roomId,
        status: 'retirada',
        origin: 'portaria',
        responsibleName: input.responsibleName,
        responsibleIdentifier: input.responsibleIdentifier,
        checkedOutByName: input.actorName,
        checkedOutByIdentifier: input.actorIdentifier,
        checkedOutAt: now,
        expectedReturnAt: input.expectedReturnAt || undefined,
        notes: input.notes || undefined,
        reservationExternalId: input.reservationExternalId || selected.blockingReservation?.externalId,
        reservationResponsibleName: input.reservationResponsibleName || selected.blockingReservation?.responsibleName,
        reservationResponsibleIdentifier: input.reservationResponsibleIdentifier || selected.blockingReservation?.responsibleIdentifier,
        actorUid: firebaseAuth.currentUser?.uid,
      });
    });
  }

  async registerReturn(input: ReturnInput): Promise<void> {
    const records = await this.listMovements();
    const open = records.find(
      (movement) => movement.keyId === input.keyId && (movement.status === 'retirada' || movement.status === 'atrasada'),
    );
    if (!open) throw new Error('Nao ha retirada aberta para esta chave.');
    await runTransaction(db, async (transaction) => {
      const movementRef = doc(db, 'key_movements', open.id);
      const lockRef = doc(db, 'key_locks', input.keyId);
      const current = await transaction.get(movementRef);
      await transaction.get(lockRef);
      if (!current.exists() || !['retirada', 'atrasada'].includes(current.data()['status'])) {
        throw new Error('A retirada ja foi devolvida.');
      }
      transaction.update(movementRef, {
        status: 'devolvida',
        returnedByName: input.actorName,
        returnedByIdentifier: input.actorIdentifier || undefined,
        returnedAt: new Date().toISOString(),
        returnNotes: input.notes || undefined,
        returnedByUid: firebaseAuth.currentUser?.uid,
      });
      transaction.delete(lockRef);
    });
  }

  async registerOccurrence(input: OccurrenceInput): Promise<void> {
    const key = await getDoc(doc(db, 'keys', input.keyId));
    if (!key.exists()) throw new Error('Chave nao encontrada.');
    const record = {
      id: `ko-${Date.now()}-${crypto.randomUUID()}`,
      keyId: input.keyId,
      roomId: input.roomId || undefined,
      type: input.type,
      origin: 'portaria',
      previousStatus: key.data()['baseStatus'],
      actorName: input.actorName,
      actorIdentifier: input.actorIdentifier || undefined,
      actorUid: firebaseAuth.currentUser?.uid,
      occurredAt: new Date().toISOString(),
      notes: input.notes,
    };
    await setDoc(doc(db, 'key_occurrences', record.id), record);
  }

  async updateUserRoles(input: UserRoleUpdate): Promise<void> {
    await updateDoc(doc(db, 'users', input.userId), {
      roles: input.roles,
      rolesUpdatedAt: new Date().toISOString(),
      rolesUpdatedBy: firebaseAuth.currentUser?.uid,
    });
  }

  async listSyncEvents(): Promise<readonly ReservationSyncEvent[]> {
    const snapshot = await getDocs(
      query(collection(db, 'reservation_sync_events'), orderBy('syncedAt', 'desc'), limit(5)),
    );
    return snapshot.docs.map((item) => item.data() as ReservationSyncEvent);
  }

  async buildReport(from?: string, to?: string): Promise<OperationalReport> {
    const [movements, occurrences] = await Promise.all([this.listMovements(), this.listOccurrences()]);
    const inRange = (value?: string) => !!value && (!from || value >= from) && (!to || value <= to);
    const periodMovements = movements.filter((item) => inRange(item.checkedOutAt) || (!from && !to));
    const periodOccurrences = occurrences.filter((item) => inRange(item.occurredAt) || (!from && !to));
    return {
      generatedAt: new Date().toISOString(),
      period: { from, to },
      movements: {
        withdrawals: periodMovements.filter((item) => !!item.checkedOutAt).length,
        returns: periodMovements.filter((item) => !!item.returnedAt).length,
        open: periodMovements.filter((item) => item.status === 'retirada' || item.status === 'atrasada').length,
        late: periodMovements.filter((item) => item.status === 'atrasada').length,
      },
      occurrences: {
        total: periodOccurrences.length,
        operational: periodOccurrences.filter((item) => item.type === 'ocorrencia').length,
        adminAdjustments: periodOccurrences.filter((item) => (item.type as string) === 'ajuste_admin').length,
      },
    };
  }

  private async readCollection<T>(name: string): Promise<readonly T[]> {
    const snapshot = await getDocs(collection(db, name));
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T);
  }

  private watchCollection<T>(
    name: string,
    onNext: (records: readonly T[]) => void,
    onError: (error: unknown) => void,
  ): Unsubscribe {
    return onSnapshot(
      collection(db, name),
      (snapshot) => onNext(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T)),
      onError,
    );
  }

  private withDerivedMovementStatus(record: KeyMovement): KeyMovement {
    if (
      record.status === 'retirada' &&
      record.expectedReturnAt &&
      new Date(record.expectedReturnAt).getTime() < Date.now()
    ) {
      return { ...record, status: 'atrasada' };
    }
    return record;
  }

  private canWithdrawSelectedKey(selected: KeyAvailability, input: MovementInput): boolean {
    if (selected.status === 'disponivel') {
      return true;
    }

    return selected.status === 'bloqueada_por_reserva' &&
      !!input.reservationExternalId &&
      input.reservationExternalId === selected.blockingReservation?.externalId;
  }
}
