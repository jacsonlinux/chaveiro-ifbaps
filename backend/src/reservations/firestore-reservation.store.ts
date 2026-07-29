import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore
} from "firebase-admin/firestore";
import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";
import {
  applyOccupancyQuery,
  applyReservationQuery,
  markReservationMissing,
  mergeReservationSeenState,
  type ReservationStore,
  type ReservationSyncEvent,
  type ReservationStoreSyncInput
} from "./reservation-store.js";
import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationSyncResult
} from "./types.js";
import {
  createCatalogFromSuapRooms,
  createProvisionalCatalog
} from "../key-control/key-availability.service.js";
import { reservationToOccupancy } from "../occupancies/reservation-occupancy.mapper.js";
import type { NormalizedOccupancy } from "../occupancies/types.js";

export class FirestoreReservationStore implements ReservationStore {
  readonly name = "firestore";
  private readonly db: Firestore;
  private readonly reservations: CollectionReference<DocumentData>;
  private readonly occupancies: CollectionReference<DocumentData>;
  private readonly syncEvents: CollectionReference<DocumentData>;
  private readonly syncStatus: DocumentReference<DocumentData>;
  private readonly rooms: CollectionReference<DocumentData>;
  private readonly keys: CollectionReference<DocumentData>;
  private readonly keyRoomLinks: CollectionReference<DocumentData>;

  constructor(private readonly config: AppConfig) {
    const serviceAccountPath = config.firebaseRuntime.serviceAccountPath;
    if (!serviceAccountPath) {
      throw new HttpError(
        503,
        "firebase_service_account_not_configured",
        "Service account do Firebase nao configurada."
      );
    }

    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert(serviceAccountPath)
      });
    this.db = getFirestore(app);
    this.reservations = this.db.collection(
      config.reservationStore.reservationsCollection
    );
    this.occupancies = this.db.collection(
      config.reservationStore.occupanciesCollection
    );
    this.syncEvents = this.db.collection(
      config.reservationStore.syncEventsCollection
    );
    this.syncStatus = this.db.collection('sync_status').doc('current');
    this.rooms = this.db.collection(config.keyCatalogStore.roomsCollection);
    this.keys = this.db.collection(config.keyCatalogStore.keysCollection);
    this.keyRoomLinks = this.db.collection(config.keyCatalogStore.linksCollection);
  }

  async list(
    query: ReservationListQuery
  ): Promise<readonly NormalizedReservation[]> {
    const snapshot = await this.reservations.get();
    const reservations = snapshot.docs.map((doc) =>
      doc.data()
    ) as NormalizedReservation[];

    return applyReservationQuery(reservations, query);
  }

  async listOccupancies(
    query: ReservationListQuery
  ): Promise<readonly NormalizedOccupancy[]> {
    const snapshot = await this.occupancies.get();
    const occupancies = snapshot.docs.map((doc) =>
      doc.data()
    ) as NormalizedOccupancy[];

    return applyOccupancyQuery(occupancies, query);
  }

  async sync(input: ReservationStoreSyncInput): Promise<ReservationSyncResult> {
    const previous = await this.loadPrevious();
    const currentIds = new Set(
      input.reservations.map((reservation) => reservation.externalId)
    );
    const maxBatchOperations = 450;
    let batch = this.db.batch();
    let batchOperations = 0;
    const queueSet = async (
      reference: DocumentReference<DocumentData>,
      value: DocumentData,
      merge = false,
    ): Promise<void> => {
      if (batchOperations >= maxBatchOperations) {
        await batch.commit();
        batch = this.db.batch();
        batchOperations = 0;
      }
      batch.set(reference, value, { merge });
      batchOperations += 1;
    };
    let writeCount = 0;
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let canceled = 0;
    let conflicted = 0;

    for (const reservation of input.reservations) {
      const previousReservation = previous.get(reservation.externalId);
      const merged = mergeReservationSeenState(reservation, previousReservation);

      if (!previousReservation) {
        created += 1;
      } else if (previousReservation.fingerprint !== reservation.fingerprint) {
        updated += 1;
      } else {
        unchanged += 1;
      }

      if (reservation.status === "canceled") {
        canceled += 1;
      }

      if (reservation.status === "conflicted") {
        conflicted += 1;
      }

      await queueSet(
        this.reservations.doc(toDocumentId(reservation)),
        stripUndefined(merged),
      );
      writeCount += 1;

      const occupancy = reservationToOccupancy(merged);
      await queueSet(
        this.occupancies.doc(toDocumentId(occupancy)),
        stripUndefined(occupancy)
      );
      writeCount += 1;
    }

    let extraOccupancyCount = 0;
    for (const occupancy of input.occupancies ?? []) {
      await queueSet(
        this.occupancies.doc(toDocumentId(occupancy)),
        stripUndefined(occupancy)
      );
      writeCount += 1;
      extraOccupancyCount += 1;
    }

    let absent = 0;
    let suspectAbsent = 0;
    for (const reservation of previous.values()) {
      if (!currentIds.has(reservation.externalId) && reservation.status !== "absent") {
        const missingReservation = markReservationMissing(
          reservation,
          input.syncedAt,
          input.absenceConfirmationSyncs
        );
        if (missingReservation.status === "absent") {
          absent += 1;
        } else {
          suspectAbsent += 1;
        }
        await queueSet(
          this.reservations.doc(toDocumentId(reservation)),
          stripUndefined(missingReservation)
        );
        writeCount += 1;

        const missingOccupancy = reservationToOccupancy(missingReservation);
        await queueSet(
          this.occupancies.doc(toDocumentId(missingOccupancy)),
          stripUndefined(missingOccupancy)
        );
        writeCount += 1;
      }
    }

    const result = {
      provider: input.provider,
      syncedAt: input.syncedAt,
      metadata: {
        ...input.metadata,
        store: this.name,
        occupancyCount: input.reservations.length + extraOccupancyCount,
        extraOccupancyCount,
        suspectAbsent
      },
      created,
      updated,
      unchanged,
      absent,
      canceled,
      conflicted,
      failed: 0,
      reservations: input.reservations
    } satisfies ReservationSyncResult;

    const { reservations: _reservations, ...syncEvent } = result;
    await queueSet(this.syncEvents.doc(), stripUndefined({
      ...syncEvent,
      reservationCount: input.reservations.length,
      occupancyCount: input.reservations.length + extraOccupancyCount,
      writeCount
    }));

    await this.projectSuapCatalog(input, queueSet);

    await batch.commit();
    return result;
  }

  private async projectSuapCatalog(
    input: ReservationStoreSyncInput,
    queueSet: (
      reference: DocumentReference<DocumentData>,
      value: DocumentData,
      merge?: boolean
    ) => Promise<void>
  ): Promise<void> {
    const catalog = input.rooms?.length
      ? createCatalogFromSuapRooms(input.rooms)
      : createProvisionalCatalog(input.reservations);
    const generatedAt = new Date().toISOString();
    const previousRoomsById = new Map<string, DocumentData>();

    if (input.rooms?.length) {
      const currentRoomIds = new Set(catalog.rooms.map((room) => room.id));
      const previousRooms = await this.rooms.get();
      for (const document of previousRooms.docs) {
        const room = document.data();
        previousRoomsById.set(document.id, room);
        if (room.source !== "suap-web" || currentRoomIds.has(document.id)) {
          continue;
        }

        await queueSet(this.rooms.doc(document.id), {
          active: false,
          disabledAt: generatedAt,
          disabledReason: "nao_retornada_pela_listagem_suap"
        }, true);
        await queueSet(this.keys.doc(`key-${document.id}`), {
          disabledAt: generatedAt,
          disabledReason: "sala_nao_retornada_pela_listagem_suap"
        }, true);
        await queueSet(
          this.keyRoomLinks.doc(`key-${document.id}__${document.id}`),
          {
            disabledAt: generatedAt,
            disabledReason: "sala_nao_retornada_pela_listagem_suap"
          },
          true
        );
      }
    }

    for (const room of catalog.rooms) {
      const previousRoom = previousRoomsById.get(room.id);
      await queueSet(this.rooms.doc(room.id), stripUndefined({
        ...room,
        firstSeenAt: previousRoom?.firstSeenAt ?? room.firstSeenAt,
        lastSeenAt: room.lastSeenAt,
        source: "suap-web",
        generatedAt,
        updatedAt: generatedAt,
        active: room.active
      }));
    }

    for (const key of catalog.keys) {
      await queueSet(this.keys.doc(key.id), stripUndefined({
        ...key,
        source: "suap-web",
        generatedAt
      }));
    }

    for (const link of catalog.links) {
      await queueSet(this.keyRoomLinks.doc(`${link.keyId}__${link.roomId}`), stripUndefined({
        ...link,
        source: "suap-web",
        generatedAt
      }));
    }
  }

  async pruneSyncEvents(cutoffIso: string): Promise<number> {
    const snapshot = await this.syncEvents
      .where("syncedAt", "<", cutoffIso)
      .limit(500)
      .get();
    const batch = this.db.batch();

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }

    if (snapshot.empty) {
      return 0;
    }

    await batch.commit();
    return snapshot.size;
  }

  async listSyncEvents(limit = 10): Promise<readonly ReservationSyncEvent[]> {
    const snapshot = await this.syncEvents
      .orderBy("syncedAt", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as ReservationSyncEvent);
  }

  async setSyncStatus(status: Record<string, unknown>): Promise<void> {
    await this.syncStatus.set(stripUndefined({
      scheduler: status,
      updatedAt: new Date().toISOString()
    }), { merge: true });
  }

  private async loadPrevious(): Promise<Map<string, NormalizedReservation>> {
    const snapshot = await this.reservations.get();
    return new Map(
      snapshot.docs.map((doc) => {
        const reservation = doc.data() as NormalizedReservation;
        return [reservation.externalId, reservation];
      })
    );
  }
}

function toDocumentId(
  source: Pick<NormalizedReservation, "externalId">
): string {
  return encodeURIComponent(source.externalId);
}

function stripUndefined(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry) => entry[1] !== undefined)
      .map(([key, item]) => [
        key,
        item && typeof item === 'object' && !Array.isArray(item)
          ? stripUndefined(item as object)
          : item
      ])
  );
}
