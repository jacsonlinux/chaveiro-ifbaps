import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { AuthService } from "../src/auth/auth-service.js";
import { MemoryAuthSessionStore } from "../src/auth/session-store.js";
import type {
  SuapOAuthProvider,
  SuapProfile,
} from "../src/auth/suap-oauth-client.js";
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

describe("auth session cleanup API", () => {
  it("lets admins delete expired application sessions", async () => {
    const store = new MemoryAuthSessionStore();
    const expired = await store.create({
      userId: "expired-user",
      roles: ["usuario"],
      ttlMs: -1_000,
    });
    const admin = await store.create({
      userId: "admin-user",
      roles: ["usuario", "admin"],
      ttlMs: 60_000,
    });
    const baseUrl = await startSessionApp(store);

    const response = await fetch(`${baseUrl}/auth/sessions/cleanup`, {
      method: "POST",
      headers: {
        cookie: `keychain_session=${encodeURIComponent(admin.id)}`,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      deleted: 1,
    });
    await expect(store.get(expired.id)).resolves.toBeUndefined();
    await expect(store.get(admin.id)).resolves.toMatchObject({
      userId: "admin-user",
    });
  });

  it("blocks non-admin session cleanup requests", async () => {
    const store = new MemoryAuthSessionStore();
    const user = await store.create({
      userId: "regular-user",
      roles: ["usuario"],
      ttlMs: 60_000,
    });
    const baseUrl = await startSessionApp(store);

    const response = await fetch(`${baseUrl}/auth/sessions/cleanup`, {
      method: "POST",
      headers: {
        cookie: `keychain_session=${encodeURIComponent(user.id)}`,
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "permission_denied",
      },
    });
  });
});

async function startSessionApp(
  sessionStore: MemoryAuthSessionStore,
): Promise<string> {
  const config = createTestAppConfig({
    auth: {
      mode: "session",
      required: true,
      sessionCookieName: "keychain_session",
      oauthStateCookieName: "keychain_oauth_state",
      sessionTtlMs: 28_800_000,
      cookieSecure: false,
      adminIdentifiers: [],
      portariaIdentifiers: [],
    },
  });
  const userStore = new MemoryUserStore();
  const authService = new AuthService(
    config,
    sessionStore,
    new FakeSuapOAuthProvider(),
    userStore,
  );

  server = createApp(
    config,
    createProvider(),
    undefined,
    undefined,
    undefined,
    undefined,
    authService,
    userStore,
  ).listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  return `http://127.0.0.1:${address.port}`;
}

class FakeSuapOAuthProvider implements SuapOAuthProvider {
  createAuthorizationUrl(_state: string): string {
    return "https://suap.example.edu.br/o/authorize/";
  }

  async exchangeCodeForProfile(_code: string): Promise<SuapProfile> {
    return {
      identificacao: "0000001",
      nome: "Usuario Teste",
      email: "usuario.teste@ifba.edu.br",
      campus: "PS",
    };
  }
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
