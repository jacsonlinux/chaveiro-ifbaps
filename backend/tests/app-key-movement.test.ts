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

describe("key movement API", () => {
  it("registers withdrawal and return through HTTP endpoints", async () => {
    const catalog = new MemoryKeyCatalogStore();
    const movementStore = new MemoryKeyMovementStore();
    const provider = createProvider();
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
    const baseUrl = await startApp(
      createApp(
        createTestAppConfig(),
        provider,
        undefined,
        availability,
        catalog,
        movementService
      )
    );

    await postJson(`${baseUrl}/api/rooms`, {
      id: "lab-01",
      name: "Laboratorio 01",
      externalRefs: ["local-ps-lab-01"]
    });
    await postJson(`${baseUrl}/api/keys`, {
      id: "key-lab-01",
      code: "CH-LAB-01"
    });
    await postJson(`${baseUrl}/api/key-room-links`, {
      keyId: "key-lab-01",
      roomId: "lab-01"
    });

    const withdrawal = await postJson(
      `${baseUrl}/api/key-movements/withdrawals`,
      {
        keyId: "key-lab-01",
        roomId: "lab-01",
        responsibleName: "Pessoa Responsavel",
        actorName: "Portaria",
        occurredAt: "2026-07-28T08:00:00.000-03:00"
      }
    );
    const openMovements = await getJson(
      `${baseUrl}/api/key-movements?status=retirada`
    );
    const returned = await postJson(`${baseUrl}/api/key-movements/returns`, {
      keyId: "key-lab-01",
      actorName: "Portaria",
      occurredAt: "2026-07-28T09:00:00.000-03:00"
    });
    const returnedHistory = await getJson(
      `${baseUrl}/api/key-movements?dateField=returnedAt&from=2026-07-28T08:30:00.000-03:00&to=2026-07-28T09:30:00.000-03:00`
    );

    expect(withdrawal).toMatchObject({
      keyId: "key-lab-01",
      roomId: "lab-01",
      status: "retirada",
      checkedOutByName: "Portaria"
    });
    expect(openMovements).toMatchObject({
      count: 1,
      results: [
        {
          id: withdrawal.id,
          status: "retirada"
        }
      ]
    });
    expect(returned).toMatchObject({
      id: withdrawal.id,
      status: "devolvida",
      returnedByName: "Portaria"
    });
    expect(returnedHistory).toMatchObject({
      count: 1,
      results: [
        {
          id: withdrawal.id,
          status: "devolvida"
        }
      ]
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

  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
  return response.json();
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url);

  expect(response.status).toBe(200);
  return response.json();
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
        reservations: []
      };
    }
  };
}
