import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationSyncResult
} from "./types.js";
import type { ScrapedSuapRoom } from "./types.js";
import type { NormalizedOccupancy } from "../occupancies/types.js";

export interface ReservationStoreSyncInput {
  readonly provider: string;
  readonly syncedAt: string;
  readonly metadata?: Record<string, unknown>;
  readonly absenceConfirmationSyncs: number;
  readonly reservations: readonly NormalizedReservation[];
  readonly occupancies?: readonly NormalizedOccupancy[];
  readonly rooms?: readonly ScrapedSuapRoom[];
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
  readonly occupancyCount?: number;
  readonly writeCount?: number;
}

export interface ReservationStore {
  readonly name: string;
  list(query: ReservationListQuery): Promise<readonly NormalizedReservation[]>;
  listOccupancies?(
    query: ReservationListQuery
  ): Promise<readonly NormalizedOccupancy[]>;
  sync(input: ReservationStoreSyncInput): Promise<ReservationSyncResult>;
  listSyncEvents?(limit?: number): Promise<readonly ReservationSyncEvent[]>;
  pruneSyncEvents?(cutoffIso: string): Promise<number>;
  setSyncStatus?(status: Record<string, unknown>): Promise<void>;
}

export function applyReservationQuery(
  reservations: Iterable<NormalizedReservation>,
  query: ReservationListQuery
): readonly NormalizedReservation[] {
  return applyTemporalRoomQuery(reservations, query);
}

export function applyOccupancyQuery(
  occupancies: Iterable<NormalizedOccupancy>,
  query: ReservationListQuery
): readonly NormalizedOccupancy[] {
  return applyTemporalRoomQuery(occupancies, query);
}

function applyTemporalRoomQuery<
  T extends Pick<
    NormalizedReservation,
    "status" | "roomName" | "startsAt" | "endsAt"
  >
>(items: Iterable<T>, query: ReservationListQuery): readonly T[] {
  return Array.from(items).filter((item) => {
    if (query.status ? item.status !== query.status : item.status === "absent") {
      return false;
    }

    if (
      query.roomName &&
      !item.roomName.toLowerCase().includes(query.roomName.toLowerCase())
    ) {
      return false;
    }

    if (query.from && item.endsAt < query.from) {
      return false;
    }

    if (query.to && item.startsAt > query.to) {
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
