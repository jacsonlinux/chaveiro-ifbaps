import { describe, expect, it } from "vitest";
import { createTestAppConfig } from "./helpers/app-config.js";
import { MemoryReservationStore } from "../src/reservations/memory-reservation.store.js";
import { ReservationSyncScheduler } from "../src/reservations/reservation-sync-scheduler.js";
import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationProvider,
  ReservationSyncResult
} from "../src/reservations/types.js";

describe("ReservationSyncScheduler", () => {
  it("records safe status for successful syncs", async () => {
    const provider = new FakeReservationProvider();
    const scheduler = new ReservationSyncScheduler(
      createTestAppConfig({
        reservationSyncSchedule: {
          enabled: true
        }
      }),
      provider,
      new MemoryReservationStore()
    );

    await scheduler.runOnce();

    expect(scheduler.status()).toMatchObject({
      enabled: true,
      running: false,
      consecutiveFailures: 0,
      lastResult: {
        provider: "fake",
        created: 1,
        reservationCount: 1
      }
    });
    expect(JSON.stringify(scheduler.status())).not.toContain("Pessoa Exemplo");
  });

  it("records failures without throwing to the scheduler caller", async () => {
    const scheduler = new ReservationSyncScheduler(
      createTestAppConfig({
        reservationSyncSchedule: {
          enabled: true
        }
      }),
      new FailingReservationProvider(),
      new MemoryReservationStore()
    );

    await scheduler.runOnce();

    expect(scheduler.status()).toMatchObject({
      consecutiveFailures: 1,
      lastErrorCode: "sync_failed",
      lastErrorMessage: "Falha simulada"
    });
  });
});

class FakeReservationProvider implements ReservationProvider {
  readonly name = "fake";

  async list(
    _query: ReservationListQuery
  ): Promise<readonly NormalizedReservation[]> {
    return [createReservation()];
  }

  async sync(): Promise<ReservationSyncResult> {
    return {
      provider: this.name,
      syncedAt: "2026-07-28T10:00:00.000Z",
      created: 1,
      updated: 0,
      unchanged: 0,
      absent: 0,
      canceled: 0,
      conflicted: 0,
      failed: 0,
      reservations: [createReservation()]
    };
  }
}

class FailingReservationProvider implements ReservationProvider {
  readonly name = "failing";

  async list(
    _query: ReservationListQuery
  ): Promise<readonly NormalizedReservation[]> {
    return [];
  }

  async sync(): Promise<ReservationSyncResult> {
    throw new Error("Falha simulada");
  }
}

function createReservation(): NormalizedReservation {
  return {
    externalId: "a",
    source: "suap-web",
    roomName: "A06 - SALA DE AULA - Bloco A (PS)",
    startsAt: "2026-07-28T14:00:00.000-03:00",
    endsAt: "2026-07-28T17:00:00.000-03:00",
    responsibleName: "Pessoa Exemplo",
    status: "active",
    fingerprint: "hash-a",
    firstSeenAt: "2026-07-28T10:00:00.000Z",
    lastSeenAt: "2026-07-28T10:00:00.000Z",
    lastSyncedAt: "2026-07-28T10:00:00.000Z"
  };
}
