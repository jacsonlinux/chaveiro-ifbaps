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
  reservationsToOccupancies
} from "../occupancies/reservation-occupancy.mapper.js";
import type { NormalizedOccupancy } from "../occupancies/types.js";

export class MemoryReservationStore implements ReservationStore {
  readonly name = "memory";
  private readonly reservations = new Map<string, NormalizedReservation>();
  private readonly occupancies = new Map<string, NormalizedOccupancy>();
  private syncEvents: ReservationSyncEvent[] = [];

  async list(
    query: ReservationListQuery
  ): Promise<readonly NormalizedReservation[]> {
    return applyReservationQuery(this.reservations.values(), query);
  }

  async listOccupancies(
    query: ReservationListQuery
  ): Promise<readonly NormalizedOccupancy[]> {
    return applyOccupancyQuery(this.occupancies.values(), query);
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
      const occupancy = reservationsToOccupancies([merged])[0];
      if (occupancy) {
        this.occupancies.set(occupancy.externalId, occupancy);
      }
    }

    for (const occupancy of input.occupancies ?? []) {
      this.occupancies.set(occupancy.externalId, occupancy);
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
        const missingOccupancy = reservationsToOccupancies([missingReservation])[0];
        if (missingOccupancy) {
          this.occupancies.set(missingOccupancy.externalId, missingOccupancy);
        }
      }
    }

    const result = {
      provider: input.provider,
      syncedAt: input.syncedAt,
      metadata: {
        ...input.metadata,
        store: this.name,
        occupancyCount: this.occupancies.size,
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

    this.syncEvents.push(toSyncEvent(result));
    return result;
  }

  async listSyncEvents(limit = 10): Promise<readonly ReservationSyncEvent[]> {
    return [...this.syncEvents]
      .sort((left, right) => right.syncedAt.localeCompare(left.syncedAt))
      .slice(0, limit);
  }

  async pruneSyncEvents(cutoffIso: string): Promise<number> {
    const before = this.syncEvents.length;
    this.syncEvents = this.syncEvents.filter(
      (event) => event.syncedAt >= cutoffIso
    );
    return before - this.syncEvents.length;
  }
}

function toSyncEvent(result: ReservationSyncResult): ReservationSyncEvent {
  return {
    provider: result.provider,
    syncedAt: result.syncedAt,
    metadata: result.metadata,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    absent: result.absent,
    canceled: result.canceled,
    conflicted: result.conflicted,
    failed: result.failed,
    reservationCount: result.reservations.length,
    occupancyCount:
      typeof result.metadata?.occupancyCount === "number"
        ? result.metadata.occupancyCount
        : undefined,
    writeCount:
      result.reservations.length +
      (typeof result.metadata?.occupancyCount === "number"
        ? result.metadata.occupancyCount
        : 0)
  };
}
