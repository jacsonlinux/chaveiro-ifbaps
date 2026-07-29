import type { NormalizedReservation } from "../reservations/types.js";
import type { NormalizedOccupancy } from "./types.js";
import { occupancyBlocksKey } from "./occupancy-rules.js";

export function reservationToOccupancy(
  reservation: NormalizedReservation
): NormalizedOccupancy {
  return {
    ...reservation,
    sourceKind: "reserva_deferida",
    roomCode: reservation.roomExternalId,
    blocksKey: occupancyBlocksKey(reservation)
  };
}

export function reservationsToOccupancies(
  reservations: readonly NormalizedReservation[]
): readonly NormalizedOccupancy[] {
  return reservations.map((reservation) => reservationToOccupancy(reservation));
}
