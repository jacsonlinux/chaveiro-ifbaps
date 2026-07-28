import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { KeyAvailabilityService } from "../src/key-control/key-availability.service.js";
import { MemoryKeyCatalogStore } from "../src/key-control/memory-key-catalog.store.js";
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

describe("key catalog API", () => {
  it("creates local rooms, keys and links used by key availability", async () => {
    const keyCatalogStore = new MemoryKeyCatalogStore();
    const reservationProvider = createProvider([
      createReservation("res-a06", "A06 - SALA DE AULA - Bloco A (PS)", "A06")
    ]);
    const keyAvailabilityService = new KeyAvailabilityService(
      reservationProvider,
      { blockBeforeMinutes: 30 },
      keyCatalogStore
    );
    const baseUrl = await startApp(
      createApp(
        createTestAppConfig(),
        reservationProvider,
        undefined,
        keyAvailabilityService,
        keyCatalogStore
      )
    );

    const room = await postJson(`${baseUrl}/api/rooms`, {
      id: "a06",
      name: "A06 - SALA DE AULA - Bloco A (PS)",
      campus: "PS",
      externalRefs: ["A06"]
    });
    const key = await postJson(`${baseUrl}/api/keys`, {
      id: "patrimonio-a06",
      code: "CH-A06",
      label: "Chave Patrimonio A06"
    });
    const link = await postJson(`${baseUrl}/api/key-room-links`, {
      keyId: key.id,
      roomId: room.id
    });
    const availability = await getJson(
      `${baseUrl}/api/keys/availability?at=2026-07-28T14:00:00.000-03:00`
    );

    expect(link).toEqual({ keyId: "patrimonio-a06", roomId: "a06" });
    expect(availability).toMatchObject({
      count: 1,
      results: [
        {
          key: {
            id: "patrimonio-a06",
            code: "CH-A06"
          },
          status: "bloqueada_por_reserva",
          blockingReservation: {
            externalId: "res-a06",
            roomName: "A06 - SALA DE AULA - Bloco A (PS)"
          }
        }
      ]
    });
    expect(availability.results[0].key).not.toHaveProperty("provisional");
  });

  it("soft-disables key-room links without deleting catalog history", async () => {
    const keyCatalogStore = new MemoryKeyCatalogStore();
    const reservationProvider = createProvider([]);
    const keyAvailabilityService = new KeyAvailabilityService(
      reservationProvider,
      { blockBeforeMinutes: 30 },
      keyCatalogStore
    );
    const baseUrl = await startApp(
      createApp(
        createTestAppConfig(),
        reservationProvider,
        undefined,
        keyAvailabilityService,
        keyCatalogStore
      )
    );

    const room = await postJson(`${baseUrl}/api/rooms`, {
      id: "a06",
      name: "A06",
      campus: "PS"
    });
    const key = await postJson(`${baseUrl}/api/keys`, {
      id: "patrimonio-a06",
      code: "CH-A06",
      label: "Chave Patrimonio A06"
    });
    await postJson(`${baseUrl}/api/key-room-links`, {
      keyId: key.id,
      roomId: room.id
    });

    const disabled = await deleteJson(
      `${baseUrl}/api/key-room-links/${encodeURIComponent(key.id)}/${encodeURIComponent(room.id)}`
    );
    const links = await getJson(`${baseUrl}/api/key-room-links`);
    const availability = await getJson(`${baseUrl}/api/keys/availability`);

    expect(disabled).toMatchObject({
      keyId: key.id,
      roomId: room.id
    });
    expect(disabled.disabledAt).toEqual(expect.any(String));
    expect(links).toMatchObject({
      count: 1,
      results: [
        {
          keyId: key.id,
          roomId: room.id,
          disabledAt: disabled.disabledAt
        }
      ]
    });
    expect(availability).toMatchObject({
      count: 0,
      results: []
    });
  });
});

async function startApp(app: Server): Promise<string> {
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  return `http://127.0.0.1:${address.port}`;
}

async function postJson(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  expect(response.status).toBe(201);
  return response.json();
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url);

  expect(response.status).toBe(200);
  return response.json();
}

async function deleteJson(url: string): Promise<any> {
  const response = await fetch(url, {
    method: "DELETE"
  });

  expect(response.status).toBe(200);
  return response.json();
}

function createProvider(
  reservations: readonly NormalizedReservation[]
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
        unchanged: reservations.length,
        absent: 0,
        canceled: 0,
        conflicted: 0,
        failed: 0,
        reservations
      };
    }
  };
}

function createReservation(
  externalId: string,
  roomName: string,
  roomExternalId: string
): NormalizedReservation {
  return {
    externalId,
    source: "suap-web",
    roomName,
    roomExternalId,
    campus: "PS",
    startsAt: "2026-07-28T14:00:00.000-03:00",
    endsAt: "2026-07-28T17:00:00.000-03:00",
    responsibleName: "Pessoa Exemplo",
    responsibleIdentifier: "0000000",
    purpose: "Aula",
    status: "active",
    fingerprint: `fingerprint-${externalId}`,
    firstSeenAt: "2026-07-28T10:00:00.000Z",
    lastSeenAt: "2026-07-28T10:00:00.000Z",
    lastSyncedAt: "2026-07-28T10:00:00.000Z"
  };
}
