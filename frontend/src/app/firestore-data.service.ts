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
  Occupancy,
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

function occupancyMatchesRoom(room: Room, occupancy: Occupancy): boolean {
  const references = new Set([
    room.name,
    ...(room.externalRefs ?? []),
  ].map(normalizeReference));

  return references.has(normalizeReference(occupancy.roomName)) ||
    (!!occupancy.roomExternalId && references.has(normalizeReference(occupancy.roomExternalId)));
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

  async listOccupancies(): Promise<readonly Occupancy[]> {
    const occupancies = await this.readCollection<Occupancy>('occupancies');
    return occupancies
      .filter((occupancy) => occupancy.status !== 'absent')
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
    return [...records].sort((left, right) => right.checkedOutAt.localeCompare(left.checkedOutAt));
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

  async listAvailability(options: { readonly includeOccupancies?: boolean } = {}): Promise<readonly KeyAvailability[]> {
    const includeOccupancies = options.includeOccupancies ?? true;
    const [rooms, keys, links, occupancies, movements] = await Promise.all([
      this.listRooms(),
      this.listKeys(),
      this.listKeyRoomLinks(),
      includeOccupancies ? this.listOccupancies() : Promise.resolve([]),
      this.listMovements(),
    ]);
    return this.buildAvailability(rooms, keys, links, occupancies, movements);
  }

  watchAvailability(
    options: { readonly includeOccupancies?: boolean },
    onNext: (records: readonly KeyAvailability[]) => void,
    onError: (error: unknown) => void,
  ): Unsubscribe {
    const includeOccupancies = options.includeOccupancies ?? true;
    let rooms: readonly Room[] = [];
    let keys: readonly PhysicalKey[] = [];
    let links: readonly KeyRoomLink[] = [];
    let occupancies: readonly Occupancy[] = [];
    let movements: readonly KeyMovement[] = [];
    const loaded = {
      rooms: false,
      keys: false,
      links: false,
      occupancies: !includeOccupancies,
      movements: false,
    };
    const emit = () => {
      if (loaded.rooms && loaded.keys && loaded.links && loaded.occupancies && loaded.movements) {
        onNext(this.buildAvailability(rooms, keys, links, occupancies, movements));
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

    if (includeOccupancies) {
      unsubscriptions.push(this.watchOccupancies((records) => {
        occupancies = records;
        loaded.occupancies = true;
        emit();
      }, onError));
    }

    const refreshTimer = setInterval(emit, 30_000);

    return () => {
      clearInterval(refreshTimer);
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

  watchOccupancies(
    onNext: (records: readonly Occupancy[]) => void,
    onError: (error: unknown) => void,
  ): Unsubscribe {
    return this.watchCollection<Occupancy>('occupancies', (records) => {
      onNext(
        records
          .filter((occupancy) => occupancy.status !== 'absent')
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
        [...records].sort((left, right) => right.checkedOutAt.localeCompare(left.checkedOutAt)),
      );
    }, onError);
  }

  private buildAvailability(
    rooms: readonly Room[],
    keys: readonly PhysicalKey[],
    links: readonly KeyRoomLink[],
    occupancies: readonly Occupancy[],
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
        .filter((movement) => movement.status === 'retirada')
        .map((movement) => [movement.keyId, movement]),
    );
    const now = Date.now();

    return activeKeys
      .map((key) => {
        const linkedRooms = activeLinks
          .filter((link) => link.keyId === key.id)
          .map((link) => activeRooms.find((room) => room.id === link.roomId))
          .filter((room): room is Room => !!room);
        const matchingOccupancies = occupancies
          .filter((occupancy) =>
            linkedRooms.some((room) => occupancyMatchesRoom(room, occupancy)),
          )
          .filter((occupancy) =>
            ['active', 'changed', 'conflicted'].includes(occupancy.status) &&
            occupancy.blocksKey !== false,
          )
          .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
        const blockingOccupancy = matchingOccupancies.find((occupancy) => {
          const starts = new Date(occupancy.startsAt).getTime();
          const ends = new Date(occupancy.endsAt).getTime();
          return starts <= now && ends > now;
        });
        const upcomingOccupancy = matchingOccupancies.find(
          (occupancy) => new Date(occupancy.startsAt).getTime() > now,
        );
        const attention = occupancies.find((occupancy) => {
          const starts = new Date(occupancy.startsAt).getTime();
          const ends = new Date(occupancy.endsAt).getTime();
          return (
            linkedRooms.some((room) => occupancyMatchesRoom(room, occupancy)) &&
            occupancy.status === 'suspect_absent' &&
            starts <= now &&
            ends > now
          );
        });
        const openMovement = openMovements.get(key.id);
        const roomRestricted = linkedRooms.length > 0 &&
          !linkedRooms.some((room) => room.active !== false && room.schedulable !== false);
        const status: KeyStatus = openMovement
          ? 'retirada'
          : blockingOccupancy
            ? 'bloqueada_por_reserva'
            : key.baseStatus;

        return {
          key,
          rooms: linkedRooms,
          status,
          roomRestricted,
          blockingOccupancy: blockingOccupancy
            ? {
                externalId: blockingOccupancy.externalId,
                roomName: blockingOccupancy.roomName,
                startsAt: blockingOccupancy.startsAt,
                endsAt: blockingOccupancy.endsAt,
                status: blockingOccupancy.status,
                responsibleName: blockingOccupancy.responsibleName,
                responsibleIdentifier: blockingOccupancy.responsibleIdentifier,
              }
            : undefined,
          upcomingOccupancy: (blockingOccupancy ?? upcomingOccupancy)
            ? {
                externalId: (blockingOccupancy ?? upcomingOccupancy)!.externalId,
                roomName: (blockingOccupancy ?? upcomingOccupancy)!.roomName,
                startsAt: (blockingOccupancy ?? upcomingOccupancy)!.startsAt,
                endsAt: (blockingOccupancy ?? upcomingOccupancy)!.endsAt,
                status: (blockingOccupancy ?? upcomingOccupancy)!.status,
                responsibleName: (blockingOccupancy ?? upcomingOccupancy)!.responsibleName,
                responsibleIdentifier: (blockingOccupancy ?? upcomingOccupancy)!.responsibleIdentifier,
              }
            : undefined,
          activeMovement: openMovement
            ? {
                responsibleName: openMovement.responsibleName,
                responsibleIdentifier: openMovement.responsibleIdentifier,
                checkedOutByName: openMovement.checkedOutByName,
                checkedOutAt: openMovement.checkedOutAt,
              }
            : undefined,
          occupancyAttention: attention
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
    await this.registerBatchWithdrawal([input]);
  }

  async registerBatchWithdrawal(inputs: readonly MovementInput[]): Promise<void> {
    if (inputs.length === 0) {
      throw new Error('Nenhuma chave selecionada para retirada.');
    }

    const keyIds = new Set(inputs.map((input) => input.keyId));
    if (keyIds.size !== inputs.length) {
      throw new Error('A mesma chave nao pode ser retirada duas vezes na mesma operacao.');
    }

    const now = new Date().toISOString();
    const availability = await this.listAvailability();
    const prepared = inputs.map((input) => {
      const selected = availability.find((item) => item.key.id === input.keyId);
      if (
        !selected ||
        !this.canWithdrawSelectedKey(selected, input) ||
        !selected.rooms.some((room) => room.id === input.roomId)
      ) {
        throw new Error('Chave indisponivel para retirada ou sala nao vinculada.');
      }

      const movementId = `km-${Date.now()}-${crypto.randomUUID()}`;
      return {
        input,
        movementId,
        keyRef: doc(db, 'keys', input.keyId),
        lockRef: doc(db, 'key_locks', input.keyId),
        movementRef: doc(db, 'key_movements', movementId),
      };
    });

    await runTransaction(db, async (transaction) => {
      const snapshots = [];
      for (const item of prepared) {
        const currentKey = await transaction.get(item.keyRef);
        const lock = await transaction.get(item.lockRef);
        snapshots.push({ item, currentKey, lock });
      }

      for (const { item, currentKey, lock } of snapshots) {
        if (!currentKey.exists() || currentKey.data()['disabledAt']) {
          throw new Error('Chave indisponivel para retirada.');
        }
        if (lock.exists()) {
          throw new Error('Uma das chaves selecionadas ja esta retirada.');
        }

        const { input } = item;
        transaction.set(item.lockRef, {
          keyId: input.keyId,
          movementId: item.movementId,
          checkedOutAt: now,
          actorUid: firebaseAuth.currentUser?.uid,
        });
        transaction.set(item.movementRef, {
          id: item.movementId,
          keyId: input.keyId,
          roomId: input.roomId,
          status: 'retirada',
          origin: 'portaria',
          responsibleName: input.responsibleName,
          responsibleIdentifier: input.responsibleIdentifier,
          checkedOutByName: input.actorName,
          checkedOutByIdentifier: input.actorIdentifier,
          checkedOutAt: now,
          notes: input.notes || undefined,
          reservationExternalId: input.reservationExternalId,
          reservationResponsibleName: input.reservationResponsibleName,
          reservationResponsibleIdentifier: input.reservationResponsibleIdentifier,
          actorUid: firebaseAuth.currentUser?.uid,
        });
      }
    });
  }

  async registerReturn(input: ReturnInput): Promise<void> {
    const records = await this.listMovements();
    const open = records.find(
      (movement) => movement.keyId === input.keyId && movement.status === 'retirada',
    );
    if (!open) throw new Error('Nao ha retirada aberta para esta chave.');
    await runTransaction(db, async (transaction) => {
      const movementRef = doc(db, 'key_movements', open.id);
      const lockRef = doc(db, 'key_locks', input.keyId);
      const current = await transaction.get(movementRef);
      await transaction.get(lockRef);
      if (!current.exists() || current.data()['status'] !== 'retirada') {
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
        open: periodMovements.filter((item) => item.status === 'retirada').length,
        records: periodMovements,
      },
      occurrences: {
        total: periodOccurrences.length,
        operational: periodOccurrences.filter((item) => item.type === 'ocorrencia').length,
        adminAdjustments: periodOccurrences.filter((item) => (item.type as string) === 'ajuste_admin').length,
        records: periodOccurrences,
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

  private canWithdrawSelectedKey(selected: KeyAvailability, input: MovementInput): boolean {
    if (selected.roomRestricted &&
      (!input.reservationExternalId || input.reservationExternalId !== selected.blockingOccupancy?.externalId)) {
      return false;
    }

    if (selected.status === 'disponivel') {
      return true;
    }

    return selected.status === 'bloqueada_por_reserva' &&
      !!input.reservationExternalId &&
      input.reservationExternalId === selected.blockingOccupancy?.externalId;
  }
}
