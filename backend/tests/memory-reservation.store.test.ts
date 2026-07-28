import { describe, expect, it } from "vitest";
import { MemoryReservationStore } from "../src/reservations/memory-reservation.store.js";
import type { NormalizedReservation } from "../src/reservations/types.js";

describe("MemoryReservationStore", () => {
  it("upserts reservations idempotently and marks missing items absent", async () => {
    const store = new MemoryReservationStore();
    const first = createReservation("a", "hash-a");
    const second = createReservation("b", "hash-b");

    await expect(
      store.sync({
        provider: "test",
        syncedAt: "2026-07-28T10:00:00.000Z",
        absenceConfirmationSyncs: 2,
        reservations: [first, second]
      })
    ).resolves.toMatchObject({
      created: 2,
      updated: 0,
      unchanged: 0,
      absent: 0
    });

    await expect(
      store.sync({
        provider: "test",
        syncedAt: "2026-07-28T10:05:00.000Z",
        absenceConfirmationSyncs: 2,
        reservations: [{ ...first, fingerprint: "hash-a2" }]
      })
    ).resolves.toMatchObject({
      created: 0,
      updated: 1,
      unchanged: 0,
      absent: 0,
      metadata: {
        suspectAbsent: 1
      }
    });

    await expect(store.list({ status: "suspect_absent" })).resolves.toMatchObject([
      {
        externalId: "b",
        status: "suspect_absent",
        missingSyncCount: 1
      }
    ]);

    await expect(
      store.sync({
        provider: "test",
        syncedAt: "2026-07-28T10:10:00.000Z",
        absenceConfirmationSyncs: 2,
        reservations: [{ ...first, fingerprint: "hash-a2" }]
      })
    ).resolves.toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
      absent: 1
    });

    await expect(store.list({ status: "absent" })).resolves.toMatchObject([
      {
        externalId: "b",
        status: "absent",
        missingSyncCount: 2,
        missingConfirmedAt: "2026-07-28T10:10:00.000Z"
      }
    ]);

    const events = await store.listSyncEvents(2);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      provider: "test",
      syncedAt: "2026-07-28T10:10:00.000Z",
      unchanged: 1,
      absent: 1,
      reservationCount: 1
    });
    expect(JSON.stringify(events)).not.toContain("Pessoa Exemplo");
  });
});

function createReservation(
  externalId: string,
  fingerprint: string
): NormalizedReservation {
  return {
    externalId,
    source: "suap-web",
    roomName: "A06 - SALA DE AULA - Bloco A (PS)",
    roomExternalId: "A06",
    campus: "PS",
    startsAt: "2026-07-28T14:00:00.000-03:00",
    endsAt: "2026-07-28T17:00:00.000-03:00",
    responsibleName: "Pessoa Exemplo",
    purpose: "Teste",
    status: "active",
    fingerprint,
    firstSeenAt: "2026-07-28T10:00:00.000Z",
    lastSeenAt: "2026-07-28T10:00:00.000Z",
    lastSyncedAt: "2026-07-28T10:00:00.000Z"
  };
}
