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
import { firebaseApp, firebaseAuth } from '../firebase';
import type {
  AppUser,
  KeyAvailability,
  KeyMovement,
  KeyOccurrence,
  KeyRoomLink,
  KeyStatus,
  Occupancy,
  OperationalReport,
  Person,
  PhysicalKey,
  Reservation,
  ReservationSyncStatus,
  ReservationSyncEvent,
  Room,
  UserRole,
} from '../app-models';

export interface PinVerifyResult {
  readonly valid: boolean;
  readonly personId?: string;
  readonly name?: string;
  readonly cargo?: string;
  readonly matricula?: string;
  readonly lockedUntil?: string;
}

export interface PinRequestResult {
  readonly id: string;
  readonly status: 'pending' | 'completed' | 'failed';
  readonly result?: PinVerifyResult;
  readonly failReason?: string;
  readonly processedAt?: string;
}

export interface QrToken {
  readonly id: string;
  readonly ownerUid: string;
  readonly personId: string;
  readonly generatedAt: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
  readonly usedByUid: string | null;
  readonly usedByEmail: string | null;
  readonly status: string;
}

interface PublicKeyStatus {
  readonly keyId: string;
  readonly status: 'disponivel' | 'retirada';
  readonly updatedAt: string;
}

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

  async getRegisteredEmailRole(email: string): Promise<UserRole | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    const snapshot = await getDoc(doc(db, 'registered_emails', normalized));
    if (!snapshot.exists()) return null;
    const role = snapshot.data()?.['role'];
    return role === 'portaria' || role === 'admin' ? (role as UserRole) : null;
  }

  async registerEmail(email: string, role: UserRole): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    await setDoc(doc(db, 'registered_emails', normalized), {
      email: normalized,
      role,
      createdAt: new Date().toISOString(),
    });
  }

  async ensureCurrentUserProfile(): Promise<AppUser | null> {
    const user = firebaseAuth.currentUser;
    if (!user || !user.email) return null;

    const profileRef = doc(db, 'users', user.uid);
    const snapshot = await getDoc(profileRef);
    const existing = snapshot.exists()
      ? (snapshot.data() as Record<string, unknown>)
      : null;
    const email = user.email.toLowerCase();
    const registeredRole = await this.getRegisteredEmailRole(email);
    const roles: readonly UserRole[] =
      email === 'jacsonlinux@gmail.com'
        ? ['admin']
        : registeredRole
          ? [registeredRole]
          : ['usuario'];
    const now = new Date().toISOString();

    let personId = typeof existing?.['personId'] === 'string'
      ? (existing['personId'] as string)
      : undefined;
    if (!personId && email) {
      const person = await this.findPersonByEmail(email);
      personId = person?.id;
    }

    if (!snapshot.exists()) {
      const profile = {
        id: user.uid,
        displayName: user.displayName || undefined,
        email: user.email,
        roles,
        personId,
        linkedAt: personId ? now : undefined,
        source: 'firebase',
        firstSeenAt: now,
        lastLoginAt: now,
        updatedAt: now,
      };
      await setDoc(profileRef, profile, { merge: true });
      return profile as AppUser;
    }

    const updates: Record<string, unknown> = { lastLoginAt: now, updatedAt: now };
    if (personId && !existing?.['personId']) {
      updates['personId'] = personId;
      updates['linkedAt'] = now;
    }
    await setDoc(profileRef, updates, { merge: true });
    const storedRoles = Array.isArray(existing?.['roles'])
      ? (existing['roles'] as UserRole[])
      : roles;
    return {
      id: user.uid,
      displayName: (existing?.['displayName'] as string | undefined) ?? user.displayName,
      email: user.email,
      roles: storedRoles,
      personId,
      linkedAt: (existing?.['linkedAt'] as string | undefined) ?? (personId ? now : undefined),
    } as AppUser;
  }

  async findPersonByEmail(email: string): Promise<Person | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;

    const snapshot = await getDocs(
      query(collection(db, 'people'), where('email', '==', normalized), limit(10)),
    );
    const active = snapshot.docs
      .map((document) => ({ id: document.id, ...document.data() }) as Person)
      .find((person) => person.active !== false);
    return active ?? null;
  }

  async getPersonById(personId: string): Promise<Person | null> {
    const snapshot = await getDoc(doc(db, 'people', personId));
    return snapshot.exists()
      ? ({ id: snapshot.id, ...snapshot.data() } as Person)
      : null;
  }

  async linkCurrentUserToPerson(personId: string): Promise<void> {
    const user = firebaseAuth.currentUser;
    if (!user) return;

    await updateDoc(doc(db, 'users', user.uid), {
      personId,
      linkedAt: new Date().toISOString(),
    });
  }

  async createQrToken(personId: string, ttlMs = 5 * 60_000): Promise<string> {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Usuário não autenticado.');

    const tokenId = `qr-${crypto.randomUUID()}`;
    const now = Date.now();
    await setDoc(doc(db, 'qr_tokens', tokenId), {
      id: tokenId,
      ownerUid: user.uid,
      personId,
      generatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
      usedAt: null,
      usedByUid: null,
      usedByEmail: null,
      status: 'active',
    });
    return tokenId;
  }

  async getQrToken(tokenId: string): Promise<QrToken | null> {
    const snapshot = await getDoc(doc(db, 'qr_tokens', tokenId));
    return snapshot.exists()
      ? ({ id: snapshot.id, ...snapshot.data() } as QrToken)
      : null;
  }

  async consumeQrToken(tokenId: string): Promise<QrToken> {
    const user = firebaseAuth.currentUser;
    const email = user?.email?.trim().toLowerCase();
    if (!user || !email) throw new Error('Usuário não autenticado.');

    const tokenRef = doc(db, 'qr_tokens', tokenId);
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tokenRef);
      if (!snapshot.exists()) throw new Error('Token nao encontrado.');
      const token = { id: snapshot.id, ...snapshot.data() } as QrToken;
      if (token.status !== 'active') throw new Error('Token ja utilizado.');
      if (new Date(token.expiresAt).getTime() < Date.now()) {
        throw new Error('QR Code expirado.');
      }

      const usedAt = new Date().toISOString();
      transaction.update(tokenRef, {
        status: 'used',
        usedAt,
        usedByUid: user.uid,
        usedByEmail: email,
      });
      return {
        ...token,
        status: 'used',
        usedAt,
        usedByUid: user.uid,
        usedByEmail: email,
      };
    });
  }

  async createPinRequestSet(pin: string, personId: string): Promise<string> {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Usuário não autenticado.');

    const requestId = `pinreq-${crypto.randomUUID()}`;
    await setDoc(doc(db, 'pin_requests', requestId), {
      id: requestId,
      uid: user.uid,
      personId,
      operation: 'set_pin',
      status: 'pending',
      pin,
      createdAt: new Date().toISOString(),
    });
    return requestId;
  }

  async createPinRequestVerify(pin: string): Promise<string> {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Usuário não autenticado.');

    const requestId = `pinreq-${crypto.randomUUID()}`;
    await setDoc(doc(db, 'pin_requests', requestId), {
      id: requestId,
      uid: user.uid,
      operation: 'verify_pin',
      status: 'pending',
      pin,
      createdAt: new Date().toISOString(),
    });
    return requestId;
  }

  watchPinRequest(
    requestId: string,
    onNext: (data: PinRequestResult) => void,
    onError: (error: unknown) => void,
  ): Unsubscribe {
    return onSnapshot(
      doc(db, 'pin_requests', requestId),
      (snapshot) => {
        if (!snapshot.exists()) {
          onNext({ id: requestId, status: 'failed', failReason: 'not_found' });
          return;
        }
        const data = snapshot.data() as Record<string, unknown>;
        onNext({
          id: requestId,
          status: (data['status'] as 'pending' | 'completed' | 'failed') ?? 'pending',
          result: data['result'] as PinVerifyResult | undefined,
          failReason: data['failReason'] as string | undefined,
          processedAt: data['processedAt'] as string | undefined,
        });
      },
      onError,
    );
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
    const [rooms, keys, links, occupancies, movements, publicStatuses] = await Promise.all([
      this.listRooms(),
      this.listKeys(),
      this.listKeyRoomLinks(),
      includeOccupancies ? this.listOccupancies() : Promise.resolve([]),
      includeOccupancies ? this.listMovements() : Promise.resolve([]),
      includeOccupancies ? Promise.resolve([]) : this.listPublicKeyStatuses(),
    ]);
    return this.buildAvailability(rooms, keys, links, occupancies, movements, publicStatuses);
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
    let publicStatuses: readonly PublicKeyStatus[] = [];
    const loaded = {
      rooms: false,
      keys: false,
      links: false,
      occupancies: !includeOccupancies,
      movements: false,
    };
    const emit = () => {
      if (loaded.rooms && loaded.keys && loaded.links && loaded.occupancies && loaded.movements) {
        onNext(this.buildAvailability(rooms, keys, links, occupancies, movements, publicStatuses));
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
    ];

    if (includeOccupancies) {
      unsubscriptions.push(this.watchMovements((records) => {
        movements = records;
        loaded.movements = true;
        emit();
      }, onError));
    } else {
      unsubscriptions.push(this.watchCollection<PublicKeyStatus>('key_public_status', (records) => {
        publicStatuses = records;
        loaded.movements = true;
        emit();
      }, onError));
    }

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
    publicStatuses: readonly PublicKeyStatus[] = [],
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
    const publicStatusByKey = new Map(publicStatuses.map((status) => [status.keyId, status.status]));
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
        const publicStatus = publicStatusByKey.get(key.id);
        const status: KeyStatus = openMovement
          ? 'retirada'
          : publicStatus === 'retirada'
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
        transaction.set(doc(db, 'key_public_status', input.keyId), {
          keyId: input.keyId,
          status: 'retirada',
          updatedAt: now,
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
      transaction.set(doc(db, 'key_public_status', input.keyId), {
        keyId: input.keyId,
        status: 'disponivel',
        updatedAt: new Date().toISOString(),
        actorUid: firebaseAuth.currentUser?.uid,
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

  private async listPublicKeyStatuses(): Promise<readonly PublicKeyStatus[]> {
    return this.readCollection<PublicKeyStatus>('key_public_status');
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
