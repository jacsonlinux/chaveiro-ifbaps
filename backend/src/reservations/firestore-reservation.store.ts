import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  type CollectionReference,
  type DocumentData,
  type Firestore
} from "firebase-admin/firestore";
import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";
import {
  applyReservationQuery,
  markReservationMissing,
  mergeReservationSeenState,
  type ReservationStore,
  type ReservationStoreSyncInput
} from "./reservation-store.js";
import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationSyncResult
} from "./types.js";

export class FirestoreReservationStore implements ReservationStore {
  readonly name = "firestore";
  private readonly db: Firestore;
  private readonly reservations: CollectionReference<DocumentData>;
  private readonly syncEvents: CollectionReference<DocumentData>;

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
    this.syncEvents = this.db.collection(
      config.reservationStore.syncEventsCollection
    );
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

  async sync(input: ReservationStoreSyncInput): Promise<ReservationSyncResult> {
    const previous = await this.loadPrevious();
    const currentIds = new Set(
      input.reservations.map((reservation) => reservation.externalId)
    );
    const batch = this.db.batch();
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

      batch.set(
        this.reservations.doc(toDocumentId(reservation)),
        stripUndefined(merged),
      );
      writeCount += 1;
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
        batch.set(
          this.reservations.doc(toDocumentId(reservation)),
          stripUndefined(missingReservation)
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
    batch.set(this.syncEvents.doc(), stripUndefined({
      ...syncEvent,
      reservationCount: input.reservations.length,
      writeCount
    }));

    await batch.commit();
    return result;
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

function toDocumentId(reservation: NormalizedReservation): string {
  return encodeURIComponent(reservation.externalId);
}

function stripUndefined(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined)
  );
}
