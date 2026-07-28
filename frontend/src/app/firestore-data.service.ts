import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
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
  readonly type: 'ocorrencia' | 'ajuste_admin';
  readonly targetStatus?: KeyStatus;
  readonly actorName: string;
  readonly actorIdentifier?: string;
  readonly notes: string;
}

interface UserRoleUpdate {
  readonly userId: string;
  readonly roles: readonly UserRole[];
}

interface CatalogRoomInput {
  readonly id?: string;
  readonly name: string;
  readonly campus?: string;
  readonly externalRefs?: readonly string[];
}

interface CatalogKeyInput {
  readonly id?: string;
  readonly code: string;
  readonly label: string;
  readonly baseStatus: KeyStatus;
}

const db = initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true });

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

  async listAvailability(): Promise<readonly KeyAvailability[]> {
    const [rooms, keys, links, reservations, movements] = await Promise.all([
      this.listRooms(),
      this.listKeys(),
      this.listKeyRoomLinks(),
      this.listReservations(),
      this.listMovements(),
    ]);
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
    const blockFrom = now - 30 * 60 * 1000;

    return activeKeys
      .map((key) => {
        const linkedRooms = activeLinks
          .filter((link) => link.keyId === key.id)
          .map((link) => activeRooms.find((room) => room.id === link.roomId))
          .filter((room): room is Room => !!room);
        const roomNames = new Set(linkedRooms.map((room) => room.name));
        const blockingReservation = reservations.find((reservation) => {
          const starts = new Date(reservation.startsAt).getTime();
          const ends = new Date(reservation.endsAt).getTime();
          return (
            roomNames.has(reservation.roomName) &&
            ['active', 'changed', 'conflicted'].includes(reservation.status) &&
            starts <= now &&
            ends >= blockFrom
          );
        });
        const attention = reservations.find((reservation) => {
          const starts = new Date(reservation.startsAt).getTime();
          const ends = new Date(reservation.endsAt).getTime();
          return (
            roomNames.has(reservation.roomName) &&
            reservation.status === 'suspect_absent' &&
            starts <= now &&
            ends >= blockFrom
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
    if (!selected || selected.status !== 'disponivel' || !selected.rooms.some((room) => room.id === input.roomId)) {
      throw new Error('Chave indisponivel para retirada ou sala nao vinculada.');
    }
    const movementId = `km-${Date.now()}-${crypto.randomUUID()}`;
    const movementRef = doc(db, 'key_movements', movementId);
    const keyRef = doc(db, 'keys', input.keyId);
    const [keySnapshot, linksSnapshot] = await Promise.all([
      getDoc(keyRef),
      getDocs(query(collection(db, 'key_room_links'), where('keyId', '==', input.keyId), where('roomId', '==', input.roomId))),
    ]);
    if (!keySnapshot.exists()) throw new Error('Chave nao encontrada.');
    if (!linksSnapshot.docs.some((item) => !item.data()['disabledAt'])) {
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
      origin: input.type === 'ajuste_admin' ? 'admin' : 'portaria',
      previousStatus: key.data()['baseStatus'],
      targetStatus: input.targetStatus || undefined,
      actorName: input.actorName,
      actorIdentifier: input.actorIdentifier || undefined,
      actorUid: firebaseAuth.currentUser?.uid,
      occurredAt: new Date().toISOString(),
      notes: input.notes,
    };
    await setDoc(doc(db, 'key_occurrences', record.id), record);
    if (input.targetStatus) {
      await updateDoc(doc(db, 'keys', input.keyId), {
        baseStatus: input.targetStatus,
        updatedAt: record.occurredAt,
        updatedBy: firebaseAuth.currentUser?.uid,
      });
    }
  }

  async createRoom(input: CatalogRoomInput): Promise<void> {
    const id = input.id?.trim() || this.normalizeCatalogId(input.name);
    await setDoc(doc(db, 'rooms', id), {
      id,
      name: input.name.trim(),
      campus: input.campus?.trim() || undefined,
      externalRefs: [...new Set([...(input.externalRefs ?? []), input.name.trim(), id])],
      updatedAt: new Date().toISOString(),
      updatedBy: firebaseAuth.currentUser?.uid,
    });
  }

  async updateRoom(id: string, input: CatalogRoomInput): Promise<void> {
    await updateDoc(doc(db, 'rooms', id), {
      name: input.name.trim(),
      campus: input.campus?.trim() || undefined,
      externalRefs: input.externalRefs ?? [],
      updatedAt: new Date().toISOString(),
      updatedBy: firebaseAuth.currentUser?.uid,
    });
  }

  async setRoomDisabled(id: string, disabled: boolean): Promise<void> {
    await updateDoc(doc(db, 'rooms', id), {
      disabledAt: disabled ? new Date().toISOString() : undefined,
      disabledBy: disabled ? firebaseAuth.currentUser?.uid : undefined,
      disabledReason: disabled ? 'desativacao administrativa' : undefined,
    });
  }

  async createKey(input: CatalogKeyInput): Promise<void> {
    const id = input.id?.trim() || this.normalizeCatalogId(input.code);
    await setDoc(doc(db, 'keys', id), {
      id,
      code: input.code.trim(),
      label: input.label.trim(),
      baseStatus: input.baseStatus,
      updatedAt: new Date().toISOString(),
      updatedBy: firebaseAuth.currentUser?.uid,
    });
  }

  async updateKey(id: string, input: CatalogKeyInput): Promise<void> {
    await updateDoc(doc(db, 'keys', id), {
      code: input.code.trim(),
      label: input.label.trim(),
      baseStatus: input.baseStatus,
      updatedAt: new Date().toISOString(),
      updatedBy: firebaseAuth.currentUser?.uid,
    });
  }

  async setKeyDisabled(id: string, disabled: boolean): Promise<void> {
    await updateDoc(doc(db, 'keys', id), {
      disabledAt: disabled ? new Date().toISOString() : undefined,
      disabledBy: disabled ? firebaseAuth.currentUser?.uid : undefined,
      disabledReason: disabled ? 'desativacao administrativa' : undefined,
    });
  }

  async createKeyRoomLink(input: KeyRoomLink): Promise<void> {
    await setDoc(doc(db, 'key_room_links', this.linkDocumentId(input.keyId, input.roomId)), {
      ...input,
      updatedAt: new Date().toISOString(),
      updatedBy: firebaseAuth.currentUser?.uid,
    });
  }

  async setKeyRoomLinkDisabled(link: KeyRoomLink, disabled: boolean): Promise<void> {
    await updateDoc(doc(db, 'key_room_links', this.linkDocumentId(link.keyId, link.roomId)), {
      disabledAt: disabled ? new Date().toISOString() : undefined,
      disabledBy: disabled ? firebaseAuth.currentUser?.uid : undefined,
      disabledReason: disabled ? 'desativacao administrativa' : undefined,
    });
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
        adminAdjustments: periodOccurrences.filter((item) => item.type === 'ajuste_admin').length,
      },
    };
  }

  private async readCollection<T>(name: string): Promise<readonly T[]> {
    const snapshot = await getDocs(collection(db, name));
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T);
  }

  private linkDocumentId(keyId: string, roomId: string): string {
    return encodeURIComponent(`${keyId}:${roomId}`);
  }

  private normalizeCatalogId(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
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
}
