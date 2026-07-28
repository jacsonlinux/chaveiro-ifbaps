import { createReservationFingerprint } from "./fingerprint.js";
import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationProvider,
  ReservationSyncResult
} from "./types.js";

const now = new Date("2026-01-01T00:00:00.000Z").toISOString();

const reservations = [
  withFingerprint({
    externalId: "local-demo-ps-lab-01-2026-01-01-0800",
    source: "local",
    roomName: "Laboratorio 01",
    roomExternalId: "local-ps-lab-01",
    campus: "PS",
    startsAt: "2026-01-01T08:00:00.000-03:00",
    endsAt: "2026-01-01T10:00:00.000-03:00",
    responsibleName: "Responsavel Exemplo",
    responsibleIdentifier: "0000000",
    purpose: "Fixture local para validar contrato de reservas",
    status: "active",
    firstSeenAt: now,
    lastSeenAt: now,
    lastSyncedAt: now,
    rawVersion: "local-fixture-v1"
  })
] satisfies readonly NormalizedReservation[];

export class LocalReservationProvider implements ReservationProvider {
  readonly name = "local";

  async list(
    query: ReservationListQuery
  ): Promise<readonly NormalizedReservation[]> {
    return reservations.filter((reservation) => matchesQuery(reservation, query));
  }

  async sync(): Promise<ReservationSyncResult> {
    return {
      provider: this.name,
      syncedAt: new Date().toISOString(),
      created: 0,
      updated: 0,
      unchanged: reservations.length,
      absent: 0,
      canceled: 0,
      conflicted: 0,
      failed: 0,
      reservations
    };
  }
}

function withFingerprint(
  reservation: Omit<NormalizedReservation, "fingerprint">
): NormalizedReservation {
  return {
    ...reservation,
    fingerprint: createReservationFingerprint(reservation)
  };
}

function matchesQuery(
  reservation: NormalizedReservation,
  query: ReservationListQuery
): boolean {
  if (query.status && reservation.status !== query.status) {
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
}
