import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";
import { getAuthContext } from "./auth-context.js";
import { expiredCookie, parseCookies, serializeCookie } from "./cookies.js";
import type { AuthSessionStore } from "./session-store.js";
import type { SuapOAuthProvider, SuapProfile } from "./suap-oauth-client.js";
import type { AuthContext, UserRole } from "./types.js";
import type { UserStore } from "../users/user.store.js";

export interface LoginStart {
  readonly authorizationUrl: string;
  readonly stateCookie: string;
}

export interface LoginCallbackResult {
  readonly context: AuthContext;
  readonly cookies: readonly string[];
}

export class AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly sessions: AuthSessionStore,
    private readonly suapOAuth: SuapOAuthProvider,
    private readonly userStore: UserStore
  ) {}

  async getAuthContext(request: IncomingMessage): Promise<AuthContext> {
    if (this.config.auth.mode !== "session") {
      return getAuthContext(this.config, request);
    }

    const sessionId = parseCookies(request)[this.config.auth.sessionCookieName];
    if (!sessionId) {
      return { authenticated: false, roles: [], source: "session" };
    }

    const session = await this.sessions.get(sessionId);
    if (!session) {
      return { authenticated: false, roles: [], source: "session" };
    }

    return {
      authenticated: true,
      userId: session.userId,
      displayName: session.displayName,
      email: session.email,
      campus: session.campus,
      roles: session.roles,
      source: "session"
    };
  }

  startSuapLogin(): LoginStart {
    const state = randomBytes(32).toString("base64url");

    return {
      authorizationUrl: this.suapOAuth.createAuthorizationUrl(state),
      stateCookie: serializeCookie(this.config.auth.oauthStateCookieName, state, {
        httpOnly: true,
        maxAgeSeconds: 600,
        path: "/auth/suap/callback",
        sameSite: "Lax",
        secure: this.config.auth.cookieSecure
      })
    };
  }

  async completeSuapLogin(
    request: IncomingMessage,
    code: string,
    state: string
  ): Promise<LoginCallbackResult> {
    const expectedState = parseCookies(request)[this.config.auth.oauthStateCookieName];
    if (!expectedState || expectedState !== state) {
      throw new HttpError(
        400,
        "invalid_oauth_state",
        "Estado OAuth invalido ou expirado."
      );
    }

    const profile = await this.suapOAuth.exchangeCodeForProfile(code);
    const roles = this.rolesForProfile(profile);
    const user = await this.userStore.upsertAuthenticatedUser({
      id: profile.identificacao,
      displayName: profile.nome,
      email: profile.email,
      campus: profile.campus,
      roles,
      source: "suap",
      loggedInAt: new Date().toISOString()
    });
    const session = await this.sessions.create({
      userId: user.id,
      displayName: user.displayName,
      email: user.email,
      campus: user.campus,
      roles: user.roles,
      ttlMs: this.config.auth.sessionTtlMs
    });

    return {
      context: {
        authenticated: true,
        userId: session.userId,
        displayName: session.displayName,
        email: session.email,
        campus: session.campus,
        roles: session.roles,
        source: "session"
      },
      cookies: [
        serializeCookie(this.config.auth.sessionCookieName, session.id, {
          httpOnly: true,
          maxAgeSeconds: Math.floor(this.config.auth.sessionTtlMs / 1000),
          path: "/",
          sameSite: "Lax",
          secure: this.config.auth.cookieSecure
        }),
        expiredCookie(
          this.config.auth.oauthStateCookieName,
          this.config.auth.cookieSecure
        )
      ]
    };
  }

  async logout(request: IncomingMessage): Promise<string> {
    const sessionId = parseCookies(request)[this.config.auth.sessionCookieName];
    if (sessionId) {
      await this.sessions.delete(sessionId);
    }

    return expiredCookie(
      this.config.auth.sessionCookieName,
      this.config.auth.cookieSecure
    );
  }

  async cleanupExpiredSessions(now = new Date()): Promise<number> {
    return this.sessions.deleteExpired(now);
  }

  private rolesForProfile(profile: SuapProfile): readonly UserRole[] {
    const identifiers = new Set(
      [profile.identificacao, profile.email].flatMap((value) =>
        value ? [normalizeIdentifier(value)] : []
      )
    );
    const roles = new Set<UserRole>(["usuario"]);

    if (matchesAny(identifiers, this.config.auth.portariaIdentifiers)) {
      roles.add("portaria");
    }

    if (matchesAny(identifiers, this.config.auth.adminIdentifiers)) {
      roles.add("admin");
    }

    return [...roles];
  }
}

function matchesAny(
  identifiers: ReadonlySet<string>,
  configured: readonly string[]
): boolean {
  return configured.some((item) => identifiers.has(normalizeIdentifier(item)));
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}
