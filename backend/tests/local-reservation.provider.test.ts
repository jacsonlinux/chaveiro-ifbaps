import { describe, expect, it } from "vitest";
import { LocalReservationProvider } from "../src/reservations/local-reservation.provider.js";

describe("LocalReservationProvider", () => {
  it("lists normalized local reservations", async () => {
    const provider = new LocalReservationProvider();
    const reservations = await provider.list({});

    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      externalId: "local-demo-ps-lab-01-2026-01-01-0800",
      source: "local",
      roomName: "Laboratorio 01",
      status: "active"
    });
    expect(reservations[0]?.fingerprint).toHaveLength(64);
  });

  it("filters by room name", async () => {
    const provider = new LocalReservationProvider();

    await expect(provider.list({ roomName: "laboratorio" })).resolves.toHaveLength(
      1
    );
    await expect(provider.list({ roomName: "auditorio" })).resolves.toHaveLength(
      0
    );
  });

  it("returns a no-op sync result for the local fixture", async () => {
    const provider = new LocalReservationProvider();
    const result = await provider.sync();

    expect(result).toMatchObject({
      provider: "local",
      created: 0,
      updated: 0,
      unchanged: 1,
      failed: 0
    });
  });
});
