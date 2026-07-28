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
import type { FirebaseTokenVerifier } from "./firebase-token-verifier.js";
import { readBearerToken } from "./firebase-token-verifier.js";

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
    private readonly userStore: UserStore,
    private readonly firebaseTokenVerifier?: FirebaseTokenVerifier,
  ) {}

  async getAuthContext(request: IncomingMessage): Promise<AuthContext> {
    if (this.config.auth.mode === "firebase") {
      return this.getFirebaseAuthContext(request);
    }

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
          sameSite: this.config.auth.cookieSameSite,
          secure: this.config.auth.cookieSecure
        }),
        expiredCookie(
          this.config.auth.oauthStateCookieName,
          this.config.auth.cookieSecure
        )
      ]
    };
  }

  async logout(request: IncomingMessage): Promise<string | undefined> {
    if (this.config.auth.mode === "firebase") {
      return undefined;
    }

    const sessionId = parseCookies(request)[this.config.auth.sessionCookieName];
    if (sessionId) {
      await this.sessions.delete(sessionId);
    }

    return expiredCookie(
      this.config.auth.sessionCookieName,
      this.config.auth.cookieSecure,
      this.config.auth.cookieSameSite
    );
  }

  async cleanupExpiredSessions(now = new Date()): Promise<number> {
    return this.sessions.deleteExpired(now);
  }

  private rolesForProfile(profile: SuapProfile): readonly UserRole[] {
    return this.rolesForIdentifiers([profile.identificacao, profile.email], false);
  }

  private async getFirebaseAuthContext(
    request: IncomingMessage,
  ): Promise<AuthContext> {
    if (!this.firebaseTokenVerifier) {
      throw new HttpError(
        503,
        "firebase_auth_not_configured",
        "Autenticacao Firebase nao configurada no backend.",
      );
    }

    const token = readBearerToken(readHeader(request, "authorization"));
    if (!token) {
      return { authenticated: false, roles: [], source: "session" };
    }

    const identity = await this.firebaseTokenVerifier.verifyIdToken(token);
    if (!identity.emailVerified) {
      throw new HttpError(
        403,
        "firebase_email_not_verified",
        "O e-mail do Firebase precisa estar verificado.",
      );
    }

    if (!this.config.auth.allowedEmails.includes(identity.email)) {
      throw new HttpError(
        403,
        "firebase_email_not_allowed",
        "Este e-mail nao esta autorizado a acessar a aplicacao.",
      );
    }

    const roles = this.rolesForIdentifiers([identity.uid, identity.email], true);
    const user = await this.userStore.upsertAuthenticatedUser({
      id: identity.uid,
      displayName: identity.displayName,
      email: identity.email,
      roles,
      source: "firebase",
      loggedInAt: new Date().toISOString(),
    });

    return {
      authenticated: true,
      userId: user.id,
      displayName: user.displayName,
      email: user.email,
      campus: user.campus,
      roles: user.roles,
      source: "session",
    };
  }

  private rolesForIdentifiers(
    values: readonly (string | undefined)[],
    includeDefaultRoles: boolean,
  ): readonly UserRole[] {
    const identifiers = new Set(
      values.flatMap((value) =>
        value ? [normalizeIdentifier(value)] : []
      )
    );
    const roles = new Set<UserRole>(["usuario"]);

    if (includeDefaultRoles) {
      for (const role of this.config.auth.defaultRoles) {
        roles.add(role);
      }
    }

    if (matchesAny(identifiers, this.config.auth.portariaIdentifiers)) {
      roles.add("portaria");
    }

    if (matchesAny(identifiers, this.config.auth.adminIdentifiers)) {
      roles.add("admin");
    }

    return [...roles];
  }
}

function readHeader(
  request: IncomingMessage,
  name: string,
): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }
  return value?.trim() || undefined;
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
