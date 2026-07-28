import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { AuthService } from "../../src/auth/auth-service.js";
import { MemoryAuthSessionStore } from "../../src/auth/session-store.js";
import type {
  FirebaseIdentity,
  FirebaseTokenVerifier,
} from "../../src/auth/firebase-token-verifier.js";
import type { SuapOAuthProvider } from "../../src/auth/suap-oauth-client.js";
import { MemoryUserStore } from "../../src/users/memory-user.store.js";
import { createTestAppConfig } from "../helpers/app-config.js";

describe("firebase application authentication", () => {
  it("accepts only a verified allowlisted Firebase identity", async () => {
    const config = createTestAppConfig({
      auth: {
        mode: "firebase",
        required: true,
        sessionCookieName: "keychain_session",
        oauthStateCookieName: "keychain_oauth_state",
        sessionTtlMs: 28_800_000,
        cookieSecure: true,
        cookieSameSite: "None",
        allowedEmails: ["jacsonlinux@gmail.com"],
        defaultRoles: ["portaria"],
        adminIdentifiers: [],
        portariaIdentifiers: [],
      },
    });
    const service = createService(config, {
      uid: "firebase-user-1",
      email: "jacsonlinux@gmail.com",
      emailVerified: true,
      displayName: "Jacson Silva",
    });

    const context = await service.getAuthContext(requestWithToken("valid"));

    expect(context).toMatchObject({
      authenticated: true,
      userId: "firebase-user-1",
      email: "jacsonlinux@gmail.com",
      roles: ["usuario", "portaria"],
      source: "session",
    });
  });

  it("rejects an authenticated identity outside the allowlist", async () => {
    const config = createTestAppConfig({
      auth: {
        mode: "firebase",
        required: true,
        sessionCookieName: "keychain_session",
        oauthStateCookieName: "keychain_oauth_state",
        sessionTtlMs: 28_800_000,
        cookieSecure: true,
        cookieSameSite: "None",
        allowedEmails: ["jacsonlinux@gmail.com"],
        defaultRoles: ["portaria"],
        adminIdentifiers: [],
        portariaIdentifiers: [],
      },
    });
    const service = createService(config, {
      uid: "firebase-user-2",
      email: "other@example.com",
      emailVerified: true,
    });

    await expect(
      service.getAuthContext(requestWithToken("valid")),
    ).rejects.toMatchObject({
      code: "firebase_email_not_allowed",
      statusCode: 403,
    });
  });
});

function createService(
  config: ReturnType<typeof createTestAppConfig>,
  identity: FirebaseIdentity,
): AuthService {
  const verifier: FirebaseTokenVerifier = {
    async verifyIdToken(_token: string): Promise<FirebaseIdentity> {
      return identity;
    },
  };
  const oauth: SuapOAuthProvider = {
    createAuthorizationUrl: () => "https://suap.example.test/authorize",
    exchangeCodeForProfile: async () => ({ identificacao: "suap-user" }),
  };

  return new AuthService(
    config,
    new MemoryAuthSessionStore(),
    oauth,
    new MemoryUserStore(),
    verifier,
  );
}

function requestWithToken(token: string): IncomingMessage {
  return {
    headers: { authorization: `Bearer ${token}` },
  } as IncomingMessage;
}
