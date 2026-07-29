import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationProvider
} from "../reservations/types.js";
import type { ReservationStore } from "../reservations/reservation-store.js";
import {
  reservationsToOccupancies
} from "./reservation-occupancy.mapper.js";
import type { NormalizedOccupancy } from "./types.js";

export type OccupancyListQuery = ReservationListQuery;

export interface OccupancyProvider {
  readonly name: string;
  list(query: OccupancyListQuery): Promise<readonly NormalizedOccupancy[]>;
}

export type LegacyReservationBackedProvider = Pick<
  ReservationProvider,
  "name" | "list"
>;

export type OccupancySource =
  | OccupancyProvider
  | LegacyReservationBackedProvider;

export function createOccupancyProvider(
  reservationProvider: LegacyReservationBackedProvider,
  reservationStore: ReservationStore
): OccupancyProvider {
  if (reservationStore.listOccupancies) {
    return new StoreBackedOccupancyProvider(
      reservationStore,
      reservationProvider
    );
  }

  return new ReservationBackedOccupancyProvider(reservationProvider);
}

export async function listOccupanciesFromSource(
  source: OccupancySource,
  query: OccupancyListQuery
): Promise<readonly NormalizedOccupancy[]> {
  const items = await source.list(query);

  if (isOccupancyList(items)) {
    return items;
  }

  return reservationsToOccupancies(items);
}

class StoreBackedOccupancyProvider implements OccupancyProvider {
  readonly name: string;

  constructor(
    private readonly reservationStore: ReservationStore,
    private readonly fallback: LegacyReservationBackedProvider
  ) {
    this.name = `${reservationStore.name}-occupancies`;
  }

  async list(
    query: OccupancyListQuery
  ): Promise<readonly NormalizedOccupancy[]> {
    const occupancies = await this.reservationStore.listOccupancies?.(query);
    if (occupancies?.length) {
      return occupancies;
    }

    const reservations = await this.fallback.list(query);
    return reservationsToOccupancies(reservations);
  }
}

class ReservationBackedOccupancyProvider implements OccupancyProvider {
  readonly name: string;

  constructor(private readonly reservationProvider: LegacyReservationBackedProvider) {
    this.name = `${reservationProvider.name}-occupancies`;
  }

  async list(
    query: OccupancyListQuery
  ): Promise<readonly NormalizedOccupancy[]> {
    const reservations = await this.reservationProvider.list(query);
    return reservationsToOccupancies(reservations);
  }
}

function isOccupancyList(
  items: readonly NormalizedOccupancy[] | readonly NormalizedReservation[]
): items is readonly NormalizedOccupancy[] {
  return items.every((item) => "blocksKey" in item && "sourceKind" in item);
}
