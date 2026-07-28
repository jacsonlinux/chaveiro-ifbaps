import { describe, expect, it } from "vitest";
import { createReservationFingerprint } from "../src/reservations/fingerprint.js";

describe("reservation fingerprint", () => {
  it("is stable for equivalent normalized values", () => {
    const first = createReservationFingerprint({
      externalId: "ABC",
      source: "local",
      roomName: " Laboratorio   01 ",
      roomExternalId: "ROOM-1",
      campus: "PS",
      startsAt: "2026-01-01T08:00:00.000-03:00",
      endsAt: "2026-01-01T10:00:00.000-03:00",
      responsibleIdentifier: "2180000",
      purpose: "Aula pratica",
      status: "active"
    });
    const second = createReservationFingerprint({
      externalId: "abc",
      source: "local",
      roomName: "laboratorio 01",
      roomExternalId: "room-1",
      campus: "ps",
      startsAt: "2026-01-01T08:00:00.000-03:00",
      endsAt: "2026-01-01T10:00:00.000-03:00",
      responsibleIdentifier: "2180000",
      purpose: "aula pratica",
      status: "active"
    });

    expect(first).toBe(second);
  });

  it("changes when a reservation-relevant field changes", () => {
    const base = {
      externalId: "abc",
      source: "local" as const,
      roomName: "Laboratorio 01",
      roomExternalId: "room-1",
      campus: "PS",
      startsAt: "2026-01-01T08:00:00.000-03:00",
      endsAt: "2026-01-01T10:00:00.000-03:00",
      responsibleIdentifier: "2180000",
      purpose: "Aula pratica",
      status: "active" as const
    };

    expect(createReservationFingerprint(base)).not.toBe(
      createReservationFingerprint({
        ...base,
        endsAt: "2026-01-01T11:00:00.000-03:00"
      })
    );
  });
});
