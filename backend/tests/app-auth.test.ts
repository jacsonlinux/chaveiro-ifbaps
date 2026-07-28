import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { KeyAvailabilityService } from "../src/key-control/key-availability.service.js";
import { MemoryKeyCatalogStore } from "../src/key-control/memory-key-catalog.store.js";
import { KeyMovementService } from "../src/key-control/key-movement.service.js";
import { MemoryKeyMovementStore } from "../src/key-control/memory-key-movement.store.js";
import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationProvider,
  ReservationSyncResult
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

describe("trusted-header authorization", () => {
  it("requires authentication when auth mode is trusted-header", async () => {
    const baseUrl = await startProtectedApp();
    const response = await fetch(`${baseUrl}/api/keys`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "authentication_required"
      }
    });
  });

  it("blocks ordinary users from managing the key catalog", async () => {
    const baseUrl = await startProtectedApp();
    const response = await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders("usuario")
      },
      body: JSON.stringify({
        id: "key-a06",
        code: "CH-A06"
      })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "permission_denied"
      }
    });
  });

  it("allows admin catalog management and portaria key movement", async () => {
    const baseUrl = await startProtectedApp();

    const room = await postJson(
      `${baseUrl}/api/rooms`,
      {
        id: "a06",
        name: "A06"
      },
      "admin"
    );
    const key = await postJson(
      `${baseUrl}/api/keys`,
      {
        id: "key-a06",
        code: "CH-A06"
      },
      "admin"
    );
    await postJson(
      `${baseUrl}/api/key-room-links`,
      {
        keyId: key.id,
        roomId: room.id
      },
      "admin"
    );

    const movement = await postJson(
      `${baseUrl}/api/key-movements/withdrawals`,
      {
        keyId: "key-a06",
        roomId: "a06",
        responsibleName: "Pessoa Responsavel",
        actorName: "Portaria"
      },
      "portaria"
    );

    expect(movement).toMatchObject({
      keyId: "key-a06",
      roomId: "a06",
      status: "retirada"
    });
  });

  it("redacts reservation responsible data for ordinary users", async () => {
    const reservation = createReservation();
    const baseUrl = await startProtectedApp([reservation]);

    const userReservations = await getJson(
      `${baseUrl}/api/reservations`,
      "usuario"
    );
    expect(userReservations.results[0]).toMatchObject({
      externalId: reservation.externalId,
      roomName: reservation.roomName,
      status: "active"
    });
    expect(userReservations.results[0]).not.toHaveProperty(
      "responsibleName"
    );
    expect(userReservations.results[0]).not.toHaveProperty(
      "responsibleIdentifier"
    );

    const portariaReservations = await getJson(
      `${baseUrl}/api/reservations`,
      "portaria"
    );
    expect(portariaReservations.results[0]).toMatchObject({
      responsibleName: "Pessoa Responsavel",
      responsibleIdentifier: "2180000"
    });
  });
});

async function startProtectedApp(
  reservations: readonly NormalizedReservation[] = []
): Promise<string> {
  const catalog = new MemoryKeyCatalogStore();
  const movementStore = new MemoryKeyMovementStore();
  const provider = createProvider(reservations);
  const availability = new KeyAvailabilityService(
    provider,
    { blockBeforeMinutes: 30 },
    catalog
  );
  const movementService = new KeyMovementService(
    catalog,
    movementStore,
    availability
  );

  server = createApp(
    createTestAppConfig({
      auth: {
        mode: "trusted-header",
        required: true
      }
    }),
    provider,
    undefined,
    availability,
    catalog,
    movementService
  ).listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  return `http://127.0.0.1:${address.port}`;
}

async function getJson(
  url: string,
  role: "usuario" | "portaria" | "admin"
): Promise<any> {
  const response = await fetch(url, {
    headers: authHeaders(role)
  });

  expect(response.status).toBe(200);
  return response.json();
}

async function postJson(
  url: string,
  body: unknown,
  role: "usuario" | "portaria" | "admin"
): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(role)
    },
    body: JSON.stringify(body)
  });

  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
  return response.json();
}

function authHeaders(role: "usuario" | "portaria" | "admin") {
  return {
    "x-keychain-user-id": `test-${role}`,
    "x-keychain-user-name": `Teste ${role}`,
    "x-keychain-user-roles": role
  };
}

function createProvider(
  reservations: readonly NormalizedReservation[] = []
): ReservationProvider {
  return {
    name: "test",
    async list(_query: ReservationListQuery) {
      return reservations;
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
        reservations
      };
    }
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
    responsibleName: "Pessoa Responsavel",
    responsibleIdentifier: "2180000",
    purpose: "Aula",
    status: "active",
    fingerprint: "reservation-fingerprint",
    firstSeenAt: "2026-07-28T10:00:00.000Z",
    lastSeenAt: "2026-07-28T10:00:00.000Z",
    lastSyncedAt: "2026-07-28T10:00:00.000Z"
  };
}
