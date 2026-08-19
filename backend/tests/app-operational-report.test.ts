import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { KeyAvailabilityService } from "../src/key-control/key-availability.service.js";
import { KeyMovementService } from "../src/key-control/key-movement.service.js";
import { MemoryKeyCatalogStore } from "../src/key-control/memory-key-catalog.store.js";
import { MemoryKeyMovementStore } from "../src/key-control/memory-key-movement.store.js";
import { KeyOccurrenceService } from "../src/key-control/key-occurrence.service.js";
import { MemoryKeyOccurrenceStore } from "../src/key-control/memory-key-occurrence.store.js";
import type {
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

describe("operational report API", () => {
  it("summarizes movements and occurrences for a period", async () => {
    const context = await startReportApp();

    await postJson(`${context.baseUrl}/api/key-movements/withdrawals`, {
      keyId: "key-a06",
      roomId: "a06",
      responsibleName: "Pessoa Responsavel",
      actorName: "Portaria",
      occurredAt: "2026-07-28T08:00:00.000-03:00",
    });
    await postJson(`${context.baseUrl}/api/key-movements/returns`, {
      keyId: "key-a06",
      actorName: "Portaria",
      occurredAt: "2026-07-28T10:00:00.000-03:00",
    });
    await postJson(`${context.baseUrl}/api/key-movements/withdrawals`, {
      keyId: "key-b01",
      roomId: "b01",
      responsibleName: "Outra Pessoa",
      actorName: "Portaria",
      occurredAt: "2020-01-01T08:00:00.000-03:00",
    });
    await postJson(`${context.baseUrl}/api/key-occurrences`, {
      keyId: "key-a06",
      roomId: "a06",
      type: "ocorrencia",
      actorName: "Portaria",
      occurredAt: "2026-07-28T11:00:00.000-03:00",
      notes: "Etiqueta danificada.",
    });
    await postJson(`${context.baseUrl}/api/key-occurrences`, {
      keyId: "key-b01",
      type: "ajuste_admin",
      origin: "admin",
      targetStatus: "danificada",
      actorName: "Admin",
      occurredAt: "2026-07-29T11:00:00.000-03:00",
      notes: "Ajuste fora do periodo.",
    });

    const report = await getJson(
      `${context.baseUrl}/api/reports/operations?from=2026-07-28T00:00:00.000-03:00&to=2026-07-28T23:59:59.000-03:00`,
    );

    expect(report).toMatchObject({
      period: {
        from: "2026-07-28T03:00:00.000Z",
        to: "2026-07-29T02:59:59.000Z",
      },
      movements: {
        withdrawals: 1,
        returns: 1,
        open: 1,
      },
      occurrences: {
        total: 1,
        operational: 1,
        adminAdjustments: 0,
      },
    });
    expect(report.generatedAt).toEqual(expect.any(String));
  });
});

async function startReportApp(): Promise<{ baseUrl: string }> {
  const catalog = new MemoryKeyCatalogStore();
  const movementStore = new MemoryKeyMovementStore();
  const occurrenceStore = new MemoryKeyOccurrenceStore();
  const provider = createProvider();
  const availability = new KeyAvailabilityService(
    provider,
    { blockBeforeMinutes: 30 },
    catalog,
  );
  const movementService = new KeyMovementService(
    catalog,
    movementStore,
    availability,
  );
  const occurrenceService = new KeyOccurrenceService(
    catalog,
    movementStore,
    occurrenceStore,
  );

  await catalog.createRoom({ id: "a06", name: "A06" });
  await catalog.createRoom({ id: "b01", name: "B01" });
  await catalog.createKey({ id: "key-a06", code: "CH-A06" });
  await catalog.createKey({ id: "key-b01", code: "CH-B01" });
  await catalog.createLink({ keyId: "key-a06", roomId: "a06" });
  await catalog.createLink({ keyId: "key-b01", roomId: "b01" });

  server = createApp(
    createTestAppConfig(),
    provider,
    undefined,
    availability,
    catalog,
    movementService,
    undefined,
    undefined,
    occurrenceService,
  ).listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function postJson(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
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
        reservations: [],
      };
    },
  };
}
