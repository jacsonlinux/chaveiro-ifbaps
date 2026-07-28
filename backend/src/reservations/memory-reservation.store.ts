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

export class MemoryReservationStore implements ReservationStore {
  readonly name = "memory";
  private readonly reservations = new Map<string, NormalizedReservation>();
  private syncEvents: ReservationSyncResult[] = [];

  async list(
    query: ReservationListQuery
  ): Promise<readonly NormalizedReservation[]> {
    return applyReservationQuery(this.reservations.values(), query);
  }

  async sync(input: ReservationStoreSyncInput): Promise<ReservationSyncResult> {
    const currentIds = new Set(
      input.reservations.map((reservation) => reservation.externalId)
    );
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let canceled = 0;
    let conflicted = 0;

    for (const reservation of input.reservations) {
      const previous = this.reservations.get(reservation.externalId);
      const merged = mergeReservationSeenState(reservation, previous);

      if (!previous) {
        created += 1;
      } else if (previous.fingerprint !== reservation.fingerprint) {
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

      this.reservations.set(reservation.externalId, merged);
    }

    let absent = 0;
    let suspectAbsent = 0;
    for (const reservation of this.reservations.values()) {
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
        this.reservations.set(
          reservation.externalId,
          missingReservation
        );
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
      reservations: applyReservationQuery(this.reservations.values(), {})
    } satisfies ReservationSyncResult;

    this.syncEvents.push(result);
    return result;
  }

  async pruneSyncEvents(cutoffIso: string): Promise<number> {
    const before = this.syncEvents.length;
    this.syncEvents = this.syncEvents.filter(
      (event) => event.syncedAt >= cutoffIso
    );
    return before - this.syncEvents.length;
  }
}
