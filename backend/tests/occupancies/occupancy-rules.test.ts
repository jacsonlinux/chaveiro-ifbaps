import { describe, expect, it } from "vitest";
import {
  isActiveBlockingOccupancy,
  isInsideOccupancyInterval,
  occupancyBlocksKey
} from "../../src/occupancies/occupancy-rules.js";
import { reservationToOccupancy } from "../../src/occupancies/reservation-occupancy.mapper.js";
import type { NormalizedReservation } from "../../src/reservations/types.js";

describe("occupancy rules", () => {
  it("blocks only during the real occupancy interval", () => {
    const occupancy = reservationToOccupancy(createReservation());

    expect(
      isActiveBlockingOccupancy(
        occupancy,
        new Date("2026-07-29T13:59:00.000-03:00")
      )
    ).toBe(false);
    expect(
      isActiveBlockingOccupancy(
        occupancy,
        new Date("2026-07-29T14:00:00.000-03:00")
      )
    ).toBe(true);
    expect(
      isActiveBlockingOccupancy(
        occupancy,
        new Date("2026-07-29T16:59:00.000-03:00")
      )
    ).toBe(true);
    expect(
      isActiveBlockingOccupancy(
        occupancy,
        new Date("2026-07-29T17:00:00.000-03:00")
      )
    ).toBe(false);
  });

  it("maps current SUAP reservations to the unified occupancy model", () => {
    const occupancy = reservationToOccupancy(
      createReservation({
        status: "active",
        roomExternalId: "C08"
      })
    );

    expect(occupancy).toMatchObject({
      externalId: "suap-reservation-1",
      source: "suap-web",
      sourceKind: "reserva_deferida",
      roomCode: "C08",
      blocksKey: true
    });
  });

  it("does not block canceled or missing records", () => {
    expect(occupancyBlocksKey(createReservation({ status: "canceled" }))).toBe(
      false
    );
    expect(occupancyBlocksKey(createReservation({ status: "absent" }))).toBe(
      false
    );
    expect(
      occupancyBlocksKey(createReservation({ status: "suspect_absent" }))
    ).toBe(false);
  });

  it("keeps interval boundaries inclusive at start and exclusive at end", () => {
    expect(
      isInsideOccupancyInterval(
        new Date("2026-07-29T14:00:00.000-03:00"),
        "2026-07-29T14:00:00.000-03:00",
        "2026-07-29T17:00:00.000-03:00"
      )
    ).toBe(true);
    expect(
      isInsideOccupancyInterval(
        new Date("2026-07-29T17:00:00.000-03:00"),
        "2026-07-29T14:00:00.000-03:00",
        "2026-07-29T17:00:00.000-03:00"
      )
    ).toBe(false);
  });
});

function createReservation(
  overrides: Partial<NormalizedReservation> = {}
): NormalizedReservation {
  return {
    externalId: "suap-reservation-1",
    source: "suap-web",
    sourceUrl: "https://suap.example.edu.br/comum/sala/reservasala_relat/",
    requestExternalId: "44487",
    roomName: "C08 - LABORATORIO DE INFORMATICA II - Bloco C (PS)",
    roomExternalId: "C08",
    campus: "PS",
    startsAt: "2026-07-29T14:00:00.000-03:00",
    endsAt: "2026-07-29T17:00:00.000-03:00",
    responsibleName: "Pessoa Exemplo",
    responsibleIdentifier: "0000000",
    purpose: "Aula",
    status: "active",
    fingerprint: "fingerprint-suap-reservation-1",
    firstSeenAt: "2026-07-29T10:00:00.000Z",
    lastSeenAt: "2026-07-29T10:00:00.000Z",
    lastSyncedAt: "2026-07-29T10:00:00.000Z",
    ...overrides
  };
}
