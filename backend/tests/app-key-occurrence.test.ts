import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { KeyAvailabilityService } from "../src/key-control/key-availability.service.js";
import { MemoryKeyCatalogStore } from "../src/key-control/memory-key-catalog.store.js";
import { MemoryKeyMovementStore } from "../src/key-control/memory-key-movement.store.js";
import { KeyOccurrenceService } from "../src/key-control/key-occurrence.service.js";
import { MemoryKeyOccurrenceStore } from "../src/key-control/memory-key-occurrence.store.js";
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

describe("key occurrence API", () => {
  it("records a portaria occurrence and changes the key status", async () => {
    const context = await startOccurrenceApp();

    const occurrence = await postJson(`${context.baseUrl}/api/key-occurrences`, {
      keyId: "key-a06",
      roomId: "a06",
      type: "ocorrencia",
      targetStatus: "em_manutencao",
      actorName: "Portaria",
      occurredAt: "2026-07-28T10:00:00.000-03:00",
      notes: "Chave com identificacao danificada."
    });
    const listed = await getJson(`${context.baseUrl}/api/key-occurrences`);
    const keys = await context.catalog.listKeys();

    expect(occurrence).toMatchObject({
      keyId: "key-a06",
      roomId: "a06",
      type: "ocorrencia",
      previousStatus: "disponivel",
      targetStatus: "em_manutencao"
    });
    expect(listed).toMatchObject({
      count: 1,
      results: [
        {
          id: occurrence.id,
          notes: "Chave com identificacao danificada."
        }
      ]
    });
    expect(keys[0]?.baseStatus).toBe("em_manutencao");
  });

  it("requires admin permission for administrative adjustments", async () => {
    const context = await startOccurrenceApp({
      auth: {
        mode: "trusted-header",
        required: true
      }
    });

    const blocked = await fetch(`${context.baseUrl}/api/key-occurrences`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders("portaria")
      },
      body: JSON.stringify({
        keyId: "key-a06",
        type: "ajuste_admin",
        targetStatus: "danificada",
        actorName: "Portaria",
        notes: "Ajuste sem permissao administrativa."
      })
    });
    const allowed = await postJson(
      `${context.baseUrl}/api/key-occurrences`,
      {
        keyId: "key-a06",
        type: "ajuste_admin",
        origin: "admin",
        targetStatus: "danificada",
        actorName: "Admin",
        notes: "Ajuste administrativo validado."
      },
      authHeaders("admin")
    );

    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toMatchObject({
      error: {
        code: "permission_denied"
      }
    });
    expect(allowed).toMatchObject({
      type: "ajuste_admin",
      origin: "admin",
      targetStatus: "danificada"
    });
  });
});

async function startOccurrenceApp(
  configOverrides: Parameters<typeof createTestAppConfig>[0] = {}
): Promise<{ baseUrl: string; catalog: MemoryKeyCatalogStore }> {
  const catalog = new MemoryKeyCatalogStore();
  const movementStore = new MemoryKeyMovementStore();
  const occurrenceStore = new MemoryKeyOccurrenceStore();
  const provider = createProvider();
  const availability = new KeyAvailabilityService(
    provider,
    { blockBeforeMinutes: 30 },
    catalog
  );
  const occurrenceService = new KeyOccurrenceService(
    catalog,
    movementStore,
    occurrenceStore
  );

  await catalog.createRoom({
    id: "a06",
    name: "A06 - SALA DE AULA - Bloco A (PS)",
    externalRefs: ["A06"]
  });
  await catalog.createKey({
    id: "key-a06",
    code: "CH-A06"
  });
  await catalog.createLink({
    keyId: "key-a06",
    roomId: "a06"
  });

  server = createApp(
    createTestAppConfig(configOverrides),
    provider,
    undefined,
    availability,
    catalog,
    undefined,
    undefined,
    undefined,
    occurrenceService
  ).listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    catalog
  };
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
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

function authHeaders(role: "usuario" | "portaria" | "admin") {
  return {
    "x-keychain-user-id": `test-${role}`,
    "x-keychain-user-name": `Teste ${role}`,
    "x-keychain-user-roles": role
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
        reservations: []
      };
    }
  };
}
