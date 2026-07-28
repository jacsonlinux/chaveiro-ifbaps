import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type {
  ReservationListQuery,
  ReservationProvider,
  ReservationSyncResult,
} from "../src/reservations/types.js";
import { MemoryUserStore } from "../src/users/memory-user.store.js";
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

describe("users API", () => {
  it("filters known users by search text and role for admins", async () => {
    const userStore = new MemoryUserStore();
    await userStore.upsertAuthenticatedUser({
      id: "0000001",
      displayName: "Ana Portaria",
      email: "ana.portaria@ifba.edu.br",
      campus: "PS",
      roles: ["usuario", "portaria"],
      source: "suap",
      loggedInAt: "2026-07-28T10:00:00.000Z",
    });
    await userStore.upsertAuthenticatedUser({
      id: "0000002",
      displayName: "Bruno Admin",
      email: "bruno.admin@ifba.edu.br",
      campus: "SSA",
      roles: ["usuario", "admin"],
      source: "suap",
      loggedInAt: "2026-07-28T10:05:00.000Z",
    });
    const baseUrl = await startProtectedApp(userStore);

    const response = await fetch(
      `${baseUrl}/api/users?search=portaria&role=portaria`,
      {
        headers: authHeaders("admin"),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      results: [
        {
          id: "0000001",
          displayName: "Ana Portaria",
          roles: ["usuario", "portaria"],
        },
      ],
    });
  });

  it("blocks non-admin users from listing known users", async () => {
    const baseUrl = await startProtectedApp(new MemoryUserStore());

    const response = await fetch(`${baseUrl}/api/users`, {
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

async function startProtectedApp(userStore: MemoryUserStore): Promise<string> {
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
    userStore,
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
