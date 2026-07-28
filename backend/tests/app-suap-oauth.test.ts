import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { AuthService } from "../src/auth/auth-service.js";
import { MemoryAuthSessionStore } from "../src/auth/session-store.js";
import type {
  SuapOAuthProvider,
  SuapProfile
} from "../src/auth/suap-oauth-client.js";
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

describe("SUAP OAuth session flow", () => {
  it("creates an application session after a valid SUAP callback", async () => {
    const baseUrl = await startSessionApp();
    const login = await fetch(`${baseUrl}/auth/suap/login`, {
      redirect: "manual"
    });

    expect(login.status).toBe(302);
    expect(login.headers.get("location")).toContain(
      "https://suap.example.edu.br/o/authorize/"
    );
    expect(login.headers.get("location")).not.toContain("test-client-secret");

    const stateCookie = requireCookie(
      login.headers.get("set-cookie"),
      "keychain_oauth_state"
    );
    const state = stateCookie.value;

    const callback = await fetch(
      `${baseUrl}/auth/suap/callback?code=valid-code&state=${state}`,
      {
        headers: {
          cookie: stateCookie.header
        }
      }
    );

    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      status: "ok",
      user: {
        userId: "0000001",
        displayName: "Usuario Teste",
        email: "usuario.teste@ifba.edu.br",
        campus: "PS"
      },
      roles: ["usuario", "admin"]
    });

    const sessionCookie = requireCookie(
      callback.headers.get("set-cookie"),
      "keychain_session"
    );
    const session = await fetch(`${baseUrl}/auth/session`, {
      headers: {
        cookie: sessionCookie.header
      }
    });

    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      authenticated: true,
      user: {
        userId: "0000001"
      },
      roles: ["usuario", "admin"],
      source: "session"
    });
  });

  it("rejects callback requests with an invalid OAuth state", async () => {
    const baseUrl = await startSessionApp();
    const response = await fetch(
      `${baseUrl}/auth/suap/callback?code=valid-code&state=wrong-state`,
      {
        headers: {
          cookie: "keychain_oauth_state=expected-state"
        }
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "invalid_oauth_state"
      }
    });
  });
});

async function startSessionApp(): Promise<string> {
  const config = createTestAppConfig({
    auth: {
      mode: "session",
      required: true,
      sessionCookieName: "keychain_session",
      oauthStateCookieName: "keychain_oauth_state",
      sessionTtlMs: 28_800_000,
      cookieSecure: false,
      adminIdentifiers: ["0000001"],
      portariaIdentifiers: []
    }
  });
  const authService = new AuthService(
    config,
    new MemoryAuthSessionStore(),
    new FakeSuapOAuthProvider()
  );

  server = createApp(
    config,
    createProvider(),
    undefined,
    undefined,
    undefined,
    undefined,
    authService
  ).listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  return `http://127.0.0.1:${address.port}`;
}

function requireCookie(
  rawHeader: string | null,
  name: string
): { header: string; value: string } {
  const match = rawHeader?.match(new RegExp(`${name}=([^;]+)`));
  if (!match?.[1]) {
    throw new Error(`Missing cookie ${name}`);
  }

  const value = decodeURIComponent(match[1]);
  return {
    header: `${name}=${encodeURIComponent(value)}`,
    value
  };
}

class FakeSuapOAuthProvider implements SuapOAuthProvider {
  createAuthorizationUrl(state: string): string {
    const url = new URL("https://suap.example.edu.br/o/authorize/");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "test-client-id");
    url.searchParams.set(
      "redirect_uri",
      "http://localhost:3000/auth/suap/callback"
    );
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCodeForProfile(_code: string): Promise<SuapProfile> {
    return {
      identificacao: "0000001",
      nome: "Usuario Teste",
      email: "usuario.teste@ifba.edu.br",
      campus: "PS"
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
        reservations: []
      };
    }
  };
}
