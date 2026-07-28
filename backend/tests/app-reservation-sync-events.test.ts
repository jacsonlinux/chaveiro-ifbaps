import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MemoryReservationStore } from "../src/reservations/memory-reservation.store.js";
import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationProvider,
  ReservationSyncResult,
} from "../src/reservations/types.js";
import { createTestAppConfig } from "./helpers/app-config.js";

let server: Server | undefined;

afterEach(async () => {
  if (!server) {
    return;
  }

  server.close();
  await once(server, "close");
  server = undefined;
});

describe("reservation sync events API", () => {
  it("lists safe reservation sync events for admins", async () => {
    const store = new MemoryReservationStore();
    await store.sync({
      provider: "test",
      syncedAt: "2026-07-28T10:00:00.000Z",
      absenceConfirmationSyncs: 2,
      reservations: [createReservation()],
    });
    const baseUrl = await startProtectedApp(store);

    const response = await fetch(
      `${baseUrl}/api/reservations/sync/events?limit=1`,
      {
        headers: authHeaders("admin"),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      count: 1,
      results: [
        {
          provider: "test",
          syncedAt: "2026-07-28T10:00:00.000Z",
          created: 1,
          reservationCount: 1,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("Pessoa Exemplo");
  });

  it("blocks non-admin users from listing reservation sync events", async () => {
    const baseUrl = await startProtectedApp(new MemoryReservationStore());

    const response = await fetch(`${baseUrl}/api/reservations/sync/events`, {
      headers: authHeaders("usuario"),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "permission_denied",
      },
    });
  });
});

async function startProtectedApp(
  reservationStore: MemoryReservationStore,
): Promise<string> {
  server = createApp(
    createTestAppConfig({
      auth: {
        mode: "trusted-header",
        required: true,
      },
    }),
    createProvider(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    reservationStore,
  ).listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  return `http://127.0.0.1:${address.port}`;
}

function authHeaders(role: "usuario" | "admin") {
  return {
    "x-keychain-user-id": `test-${role}`,
    "x-keychain-user-name": `Teste ${role}`,
    "x-keychain-user-roles": role,
  };
}

function createProvider(): ReservationProvider {
  return {
    name: "test",
    async list(_query: ReservationListQuery) {
      return [];
    },
    async sync(): Promise<ReservationSyncResult> {
      return {
        provider: "test",
        syncedAt: "2026-07-28T10:00:00.000Z",
        created: 0,
        updated: 0,
        unchanged: 0,
        absent: 0,
        canceled: 0,
        conflicted: 0,
        failed: 0,
        reservations: [],
      };
    },
  };
}

function createReservation(): NormalizedReservation {
  return {
    externalId: "reservation-a06",
    source: "suap-web",
    roomName: "A06",
    campus: "PS",
    startsAt: "2026-07-28T13:00:00.000Z",
    endsAt: "2026-07-28T15:00:00.000Z",
    responsibleName: "Pessoa Exemplo",
    responsibleIdentifier: "2180000",
    purpose: "Aula",
    status: "active",
    fingerprint: "reservation-fingerprint",
    firstSeenAt: "2026-07-28T10:00:00.000Z",
    lastSeenAt: "2026-07-28T10:00:00.000Z",
    lastSyncedAt: "2026-07-28T10:00:00.000Z",
  };
}
