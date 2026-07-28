import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationSyncResult
} from "./types.js";

export interface ReservationStoreSyncInput {
  readonly provider: string;
  readonly syncedAt: string;
  readonly metadata?: Record<string, unknown>;
  readonly absenceConfirmationSyncs: number;
  readonly reservations: readonly NormalizedReservation[];
}

export interface ReservationSyncEvent {
  readonly provider: string;
  readonly syncedAt: string;
  readonly metadata?: Record<string, unknown>;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly absent: number;
  readonly canceled: number;
  readonly conflicted: number;
  readonly failed: number;
  readonly reservationCount?: number;
  readonly writeCount?: number;
}

export interface ReservationStore {
  readonly name: string;
  list(query: ReservationListQuery): Promise<readonly NormalizedReservation[]>;
  sync(input: ReservationStoreSyncInput): Promise<ReservationSyncResult>;
  listSyncEvents?(limit?: number): Promise<readonly ReservationSyncEvent[]>;
  pruneSyncEvents?(cutoffIso: string): Promise<number>;
}

export function applyReservationQuery(
  reservations: Iterable<NormalizedReservation>,
  query: ReservationListQuery
): readonly NormalizedReservation[] {
  return Array.from(reservations).filter((reservation) => {
    if (query.status) {
      return reservation.status === query.status;
    }

    if (reservation.status === "absent") {
      return false;
    }

    if (
      query.roomName &&
      !reservation.roomName.toLowerCase().includes(query.roomName.toLowerCase())
    ) {
      return false;
    }

    if (query.from && reservation.endsAt < query.from) {
      return false;
    }

    if (query.to && reservation.startsAt > query.to) {
      return false;
    }

    return true;
  });
}

export function mergeReservationSeenState(
  next: NormalizedReservation,
  previous: NormalizedReservation | undefined
): NormalizedReservation {
  if (!previous) {
    return next;
  }

  return {
    ...next,
    firstSeenAt: previous.firstSeenAt,
    missingFirstSeenAt: undefined,
    missingLastSeenAt: undefined,
    missingSyncCount: undefined,
    missingConfirmedAt: undefined
  };
}

export function markReservationMissing(
  reservation: NormalizedReservation,
  syncedAt: string,
  absenceConfirmationSyncs: number
): NormalizedReservation {
  const missingSyncCount = (reservation.missingSyncCount ?? 0) + 1;
  const confirmed = missingSyncCount >= absenceConfirmationSyncs;

  return {
    ...reservation,
    status: confirmed ? "absent" : "suspect_absent",
    lastSyncedAt: syncedAt,
    missingFirstSeenAt: reservation.missingFirstSeenAt ?? syncedAt,
    missingLastSeenAt: syncedAt,
    missingSyncCount,
    missingConfirmedAt: confirmed
      ? reservation.missingConfirmedAt ?? syncedAt
      : undefined
  };
}
