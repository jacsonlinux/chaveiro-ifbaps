import { existsSync, readFileSync } from "node:fs";
import type { UserRole } from "../auth/types.js";

export type ReservationProviderName = "local" | "api" | "web-readonly";
export type ReservationStoreName = "memory" | "firestore";
export type KeyCatalogStoreName = "memory" | "firestore";
export type KeyMovementStoreName = "memory" | "firestore";
export type AuthMode = "disabled" | "trusted-header" | "session" | "firebase";
export type CookieSameSite = "Lax" | "Strict" | "None";
export type UserStoreName = "memory" | "firestore";
export type KeyOccurrenceStoreName = "memory" | "firestore";
export type AuthSessionStoreName = "memory" | "firestore";

export interface AppConfig {
  readonly nodeEnv: string;
  readonly port: number;
  readonly externalEnvPath: string;
  readonly externalEnvLoaded: boolean;
  readonly reservationProvider: ReservationProviderName;
  readonly reservationStore: {
    readonly name: ReservationStoreName;
    readonly cacheTtlMs: number;
    readonly absenceConfirmationSyncs: number;
    readonly syncEventRetentionDays: number;
    readonly firestoreConfigured: boolean;
    readonly reservationsCollection: string;
    readonly occupanciesCollection: string;
    readonly syncEventsCollection: string;
  };
  readonly reservationSyncSchedule: {
    readonly enabled: boolean;
    readonly intervalMs: number;
    readonly backoffMinMs: number;
    readonly backoffMaxMs: number;
    readonly windowStartMinutes: number;
    readonly windowEndMinutes: number;
  };
  readonly keyControl: {
    readonly reservationBlockBeforeMinutes: number;
  };
  readonly keyCatalogStore: {
    readonly name: KeyCatalogStoreName;
    readonly firestoreConfigured: boolean;
    readonly roomsCollection: string;
    readonly keysCollection: string;
    readonly linksCollection: string;
  };
  readonly keyMovementStore: {
    readonly name: KeyMovementStoreName;
    readonly firestoreConfigured: boolean;
    readonly movementsCollection: string;
  };
  readonly keyOccurrenceStore: {
    readonly name: KeyOccurrenceStoreName;
    readonly firestoreConfigured: boolean;
    readonly occurrencesCollection: string;
  };
  readonly userStore: {
    readonly name: UserStoreName;
    readonly firestoreConfigured: boolean;
    readonly usersCollection: string;
  };
  readonly auth: {
    readonly mode: AuthMode;
    readonly required: boolean;
    readonly sessionCookieName: string;
    readonly oauthStateCookieName: string;
    readonly sessionTtlMs: number;
    readonly cookieSecure: boolean;
    readonly cookieSameSite: CookieSameSite;
    readonly allowedEmails: readonly string[];
    readonly defaultRoles: readonly UserRole[];
    readonly adminIdentifiers: readonly string[];
    readonly portariaIdentifiers: readonly string[];
  };
  readonly authSessionStore: {
    readonly name: AuthSessionStoreName;
    readonly firestoreConfigured: boolean;
    readonly sessionsCollection: string;
  };
  readonly frontend: {
    readonly baseUrl: string;
  };
  readonly cors: {
    readonly enabled: boolean;
    readonly allowedOrigins: readonly string[];
  };
  readonly pinControl: {
    readonly enabled: boolean;
    readonly requestsCollection: string;
    readonly attemptsCollection: string;
    readonly peopleCollection: string;
    readonly minDigits: number;
    readonly maxDigits: number;
    readonly requestTtlMs: number;
    readonly maxAttempts: number;
    readonly lockoutMs: number;
    readonly sweepIntervalMs: number;
  };
  readonly firebaseRuntime: {
    readonly serviceAccountPath?: string;
  };
  readonly suapRuntime: {
    readonly baseUrl?: string;
    readonly loginUrl?: string;
    readonly username?: string;
    readonly password?: string;
    readonly reservationReportUrl?: string;
    readonly roomsUrl?: string;
  };
  readonly suapOAuthRuntime: {
    readonly clientId?: string;
    readonly clientSecret?: string;
    readonly redirectUri?: string;
    readonly authorizeUrl?: string;
    readonly tokenUrl?: string;
    readonly meUrl?: string;
    readonly scope?: string;
  };
  readonly suap: {
    readonly baseUrlConfigured: boolean;
    readonly loginUrlConfigured: boolean;
    readonly usernameConfigured: boolean;
    readonly passwordConfigured: boolean;
    readonly webLoginConfigured: boolean;
    readonly webReadonlyEnabled: boolean;
    readonly reservationReportUrl?: string;
    readonly roomsUrl?: string;
    readonly reservationReportUrlConfigured: boolean;
    readonly reservationSyncWindowDays: number;
    readonly reservationStartTime: string;
    readonly reservationEndTime: string;
    readonly reservationCampusId?: string;
    readonly reservationStatus: string;
    readonly browserHeadless: boolean;
    readonly browserTimeoutMs: number;
    readonly roomScheduleSyncEnabled: boolean;
    readonly roomScheduleSyncWindowDays: number;
    readonly roomScheduleSyncMaxRooms: number;
    readonly reservationRoomUrls: readonly string[];
    readonly reservationRoomUrlCount: number;
    readonly reservationTargetsConfigured: boolean;
    readonly oauthConfigured: boolean;
    readonly oauthClientIdConfigured: boolean;
    readonly oauthClientSecretConfigured: boolean;
    readonly oauthRedirectUriConfigured: boolean;
    readonly oauthAuthorizeUrlConfigured: boolean;
    readonly oauthTokenUrlConfigured: boolean;
    readonly oauthMeUrlConfigured: boolean;
    readonly oauthScopeConfigured: boolean;
  };
}

type EnvMap = Record<string, string | undefined>;

const DEFAULT_EXTERNAL_ENV_PATH = "/etc/keychain-ifbaps/.env";

export function parseDotEnv(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

export function loadExternalEnv(path = DEFAULT_EXTERNAL_ENV_PATH): {
  loaded: boolean;
  values: Record<string, string>;
} {
  if (!existsSync(path)) {
    return { loaded: false, values: {} };
  }

  return {
    loaded: true,
    values: parseDotEnv(readFileSync(path, "utf8")),
  };
}

export function createAppConfig(processEnv: EnvMap = process.env): AppConfig {
  const externalEnvPath =
    processEnv.EXTERNAL_ENV_PATH?.trim() || DEFAULT_EXTERNAL_ENV_PATH;
  const externalEnv = loadExternalEnv(externalEnvPath);
  const env = { ...externalEnv.values, ...processEnv };

  const reservationProvider = parseReservationProvider(
    env.SUAP_RESERVATION_PROVIDER,
  );
  const authMode = parseAuthMode(env.AUTH_MODE);
  const serviceAccountPath =
    parseOptionalString(env.FIREBASE_SERVICE_ACCOUNT_PATH) ??
    "/etc/keychain-ifbaps/keychain-ifbaps-firebase-adminsdk-fbsvc-9a18ddb436.json";
  const suap = {
    baseUrlConfigured: Boolean(env.SUAP_URL),
    loginUrlConfigured: Boolean(env.SUAP_URL_LOGIN),
    usernameConfigured: Boolean(env.SUAP_USERNAME),
    passwordConfigured: Boolean(env.SUAP_PASSWD),
    webReadonlyEnabled: parseBoolean(env.SUAP_WEB_READONLY_ENABLED),
    reservationReportUrl: parseOptionalString(env.SUAP_RESERVATION_REPORT_URL),
    roomsUrl: parseOptionalString(env.SUAP_ROOMS_URL),
    reservationSyncWindowDays: parseWindowDays(
      env.SUAP_RESERVATION_SYNC_WINDOW_DAYS,
    ),
    reservationStartTime:
      parseOptionalString(env.SUAP_RESERVATION_START_TIME) ?? "07:00",
    reservationEndTime:
      parseOptionalString(env.SUAP_RESERVATION_END_TIME) ?? "17:00",
    reservationCampusId: parseOptionalString(env.SUAP_RESERVATION_CAMPUS_ID),
    reservationStatus:
      parseOptionalString(env.SUAP_RESERVATION_STATUS) ?? "deferida",
    browserHeadless: parseBoolean(env.SUAP_BROWSER_HEADLESS ?? "true"),
    browserTimeoutMs: parseTimeoutMs(env.SUAP_BROWSER_TIMEOUT_MS),
    roomScheduleSyncEnabled: parseBoolean(
      env.SUAP_ROOM_SCHEDULE_SYNC_ENABLED,
    ),
    roomScheduleSyncWindowDays: parseRoomScheduleWindowDays(
      env.SUAP_ROOM_SCHEDULE_SYNC_WINDOW_DAYS,
    ),
    roomScheduleSyncMaxRooms: parseRoomScheduleMaxRooms(
      env.SUAP_ROOM_SCHEDULE_SYNC_MAX_ROOMS,
    ),
    reservationRoomUrls: parseList(env.SUAP_RESERVATION_ROOM_URLS),
  };
  const suapOAuth = {
    clientId: parseOptionalString(env.SUAP_CLIENT_ID),
    clientSecret: parseOptionalString(env.SUAP_CLIENT_SECRET),
    redirectUri: parseOptionalString(env.SUAP_REDIRECT_URI),
    authorizeUrl:
      parseOptionalString(env.SUAP_AUTHORIZE_URL) ??
      parseOptionalString(env.SUAP_OAUTH_AUTHORIZE_URL) ??
      deriveSuapUrl(
        suap.baseUrlConfigured ? env.SUAP_URL : undefined,
        "/o/authorize/",
      ),
    tokenUrl:
      parseOptionalString(env.SUAP_TOKEN_URL) ??
      parseOptionalString(env.SUAP_OAUTH_TOKEN_URL) ??
      deriveSuapUrl(
        suap.baseUrlConfigured ? env.SUAP_URL : undefined,
        "/o/token/",
      ),
    meUrl:
      parseOptionalString(env.SUAP_ME_URL) ??
      parseOptionalString(env.SUAP_OAUTH_ME_URL) ??
      deriveSuapUrl(
        suap.baseUrlConfigured ? env.SUAP_URL : undefined,
        "/api/eu/",
      ),
    scope: parseOptionalString(env.SUAP_OAUTH_SCOPE),
  };
  const corsAllowedOrigins = parseCorsOrigins(env.CORS_ALLOWED_ORIGINS);
  const cookieSameSite = parseCookieSameSite(env.AUTH_COOKIE_SAME_SITE);

  return {
    nodeEnv: env.NODE_ENV || "development",
    port: parsePort(env.PORT),
    externalEnvPath,
    externalEnvLoaded: externalEnv.loaded,
    reservationProvider,
    reservationStore: {
      name: parseReservationStore(env.RESERVATION_STORE),
      cacheTtlMs: parseCacheTtlMs(env.RESERVATION_CACHE_TTL_MS),
      absenceConfirmationSyncs: parseAbsenceConfirmationSyncs(
        env.RESERVATION_ABSENCE_CONFIRMATION_SYNCS,
      ),
      syncEventRetentionDays: parseRetentionDays(
        env.RESERVATION_SYNC_EVENT_RETENTION_DAYS,
      ),
      firestoreConfigured: Boolean(serviceAccountPath),
      reservationsCollection:
        parseOptionalString(env.FIRESTORE_RESERVATIONS_COLLECTION) ??
        "reservations",
      occupanciesCollection:
        parseOptionalString(env.FIRESTORE_OCCUPANCIES_COLLECTION) ??
        "occupancies",
      syncEventsCollection:
        parseOptionalString(env.FIRESTORE_SYNC_EVENTS_COLLECTION) ??
        "reservation_sync_events",
    },
    reservationSyncSchedule: {
      enabled: parseBoolean(env.RESERVATION_SYNC_SCHEDULE_ENABLED),
      intervalMs: parseDurationMs(env.RESERVATION_SYNC_INTERVAL_MS, 300_000),
      backoffMinMs: parseDurationMs(
        env.RESERVATION_SYNC_BACKOFF_MIN_MS,
        60_000,
      ),
      backoffMaxMs: parseDurationMs(
        env.RESERVATION_SYNC_BACKOFF_MAX_MS,
        1_800_000,
      ),
      ...buildSyncWindow(
        parseWindowMinutes(env.RESERVATION_SYNC_WINDOW_START, "07:00"),
        parseWindowMinutes(env.RESERVATION_SYNC_WINDOW_END, "18:00"),
      ),
    },
    keyControl: {
      reservationBlockBeforeMinutes: parseReservationBlockBeforeMinutes(
        env.KEY_RESERVATION_BLOCK_MINUTES,
      ),
    },
    keyCatalogStore: {
      name: parseKeyCatalogStore(env.KEY_CATALOG_STORE),
      firestoreConfigured: Boolean(serviceAccountPath),
      roomsCollection:
        parseOptionalString(env.FIRESTORE_ROOMS_COLLECTION) ?? "rooms",
      keysCollection:
        parseOptionalString(env.FIRESTORE_KEYS_COLLECTION) ?? "keys",
      linksCollection:
        parseOptionalString(env.FIRESTORE_KEY_ROOM_LINKS_COLLECTION) ??
        "key_room_links",
    },
    keyMovementStore: {
      name: parseKeyMovementStore(env.KEY_MOVEMENT_STORE),
      firestoreConfigured: Boolean(serviceAccountPath),
      movementsCollection:
        parseOptionalString(env.FIRESTORE_KEY_MOVEMENTS_COLLECTION) ??
        "key_movements",
    },
    keyOccurrenceStore: {
      name: parseKeyOccurrenceStore(env.KEY_OCCURRENCE_STORE),
      firestoreConfigured: Boolean(serviceAccountPath),
      occurrencesCollection:
        parseOptionalString(env.FIRESTORE_KEY_OCCURRENCES_COLLECTION) ??
        "key_occurrences",
    },
    userStore: {
      name: parseUserStore(env.USER_STORE),
      firestoreConfigured: Boolean(serviceAccountPath),
      usersCollection:
        parseOptionalString(env.FIRESTORE_USERS_COLLECTION) ?? "users",
    },
    auth: {
      mode: authMode,
      required: authMode !== "disabled",
      sessionCookieName:
        parseOptionalString(env.AUTH_SESSION_COOKIE_NAME) ?? "keychain_session",
      oauthStateCookieName:
        parseOptionalString(env.AUTH_OAUTH_STATE_COOKIE_NAME) ??
        "keychain_oauth_state",
      sessionTtlMs: parseDurationMs(env.AUTH_SESSION_TTL_MS, 28_800_000),
      cookieSecure:
        parseBoolean(env.AUTH_COOKIE_SECURE) || cookieSameSite === "None",
      cookieSameSite,
      allowedEmails: parseEmailList(env.AUTH_ALLOWED_EMAILS),
      defaultRoles: parseUserRoles(env.AUTH_DEFAULT_ROLES, ["usuario"]),
      adminIdentifiers: parseList(env.AUTH_ADMIN_IDENTIFIERS),
      portariaIdentifiers: parseList(env.AUTH_PORTARIA_IDENTIFIERS),
    },
    authSessionStore: {
      name: parseAuthSessionStore(env.AUTH_SESSION_STORE),
      firestoreConfigured: Boolean(serviceAccountPath),
      sessionsCollection:
        parseOptionalString(env.FIRESTORE_AUTH_SESSIONS_COLLECTION) ??
        "auth_sessions",
    },
    frontend: {
      baseUrl:
        parseOptionalString(env.APP_FRONTEND_URL) ?? "http://localhost:4200/",
    },
    cors: {
      enabled: corsAllowedOrigins.length > 0,
      allowedOrigins: corsAllowedOrigins,
    },
    firebaseRuntime: {
      serviceAccountPath,
    },
    pinControl: {
      enabled: parseBoolean(env.PIN_REQUESTS_ENABLED),
      requestsCollection:
        parseOptionalString(env.FIRESTORE_PIN_REQUESTS_COLLECTION) ??
        "pin_requests",
      attemptsCollection:
        parseOptionalString(env.FIRESTORE_PIN_ATTEMPTS_COLLECTION) ??
        "pin_attempts",
      peopleCollection:
        parseOptionalString(env.FIRESTORE_PEOPLE_COLLECTION) ?? "people",
      minDigits: parsePinDigits(env.PIN_MIN_DIGITS, 6),
      maxDigits: parsePinDigits(env.PIN_MAX_DIGITS, 6),
      requestTtlMs: parseDurationMs(env.PIN_REQUEST_TTL_MS, 60_000),
      maxAttempts: parsePinMaxAttempts(env.PIN_MAX_ATTEMPTS),
      lockoutMs: parseDurationMs(env.PIN_LOCKOUT_MS, 15 * 60_000),
      sweepIntervalMs: parseDurationMs(env.PIN_SWEEP_INTERVAL_MS, 60_000),
    },
    suapRuntime: {
      baseUrl: parseOptionalString(env.SUAP_URL),
      loginUrl: parseOptionalString(env.SUAP_URL_LOGIN),
      username: parseOptionalString(env.SUAP_USERNAME),
      password: parseOptionalString(env.SUAP_PASSWD),
      reservationReportUrl: suap.reservationReportUrl,
      roomsUrl: suap.roomsUrl,
    },
    suapOAuthRuntime: suapOAuth,
    suap: {
      ...suap,
      webLoginConfigured:
        suap.baseUrlConfigured &&
        suap.loginUrlConfigured &&
        suap.usernameConfigured &&
        suap.passwordConfigured,
      reservationReportUrlConfigured: Boolean(suap.reservationReportUrl),
      reservationRoomUrlCount: suap.reservationRoomUrls.length,
      reservationTargetsConfigured:
        Boolean(suap.reservationReportUrl) ||
        suap.reservationRoomUrls.length > 0,
      oauthConfigured:
        Boolean(suapOAuth.clientId) &&
        Boolean(suapOAuth.clientSecret) &&
        Boolean(suapOAuth.redirectUri) &&
        Boolean(suapOAuth.authorizeUrl) &&
        Boolean(suapOAuth.tokenUrl) &&
        Boolean(suapOAuth.meUrl),
      oauthClientIdConfigured: Boolean(suapOAuth.clientId),
      oauthClientSecretConfigured: Boolean(suapOAuth.clientSecret),
      oauthRedirectUriConfigured: Boolean(suapOAuth.redirectUri),
      oauthAuthorizeUrlConfigured: Boolean(suapOAuth.authorizeUrl),
      oauthTokenUrlConfigured: Boolean(suapOAuth.tokenUrl),
      oauthMeUrlConfigured: Boolean(suapOAuth.meUrl),
      oauthScopeConfigured: Boolean(suapOAuth.scope),
    },
  };
}

export function publicConfig(config: AppConfig): Record<string, unknown> {
  const {
    reservationReportUrl: _reservationReportUrl,
    reservationRoomUrls: _reservationRoomUrls,
    roomsUrl: _roomsUrl,
    ...publicSuap
  } = config.suap;
  const {
    allowedEmails: _allowedEmails,
    adminIdentifiers: _adminIdentifiers,
    portariaIdentifiers: _portariaIdentifiers,
    ...publicAuth
  } = config.auth;

  return {
    nodeEnv: config.nodeEnv,
    port: config.port,
    externalEnvPath: config.externalEnvPath,
    externalEnvLoaded: config.externalEnvLoaded,
    reservationProvider: config.reservationProvider,
    reservationStore: config.reservationStore,
    reservationSyncSchedule: config.reservationSyncSchedule,
    keyControl: config.keyControl,
    keyCatalogStore: config.keyCatalogStore,
    keyMovementStore: config.keyMovementStore,
    keyOccurrenceStore: config.keyOccurrenceStore,
    userStore: config.userStore,
    authSessionStore: config.authSessionStore,
    pinControl: config.pinControl,
    frontend: config.frontend,
    cors: config.cors,
    auth: {
      ...publicAuth,
      allowedEmailCount: config.auth.allowedEmails.length,
      adminIdentifierCount: config.auth.adminIdentifiers.length,
      portariaIdentifierCount: config.auth.portariaIdentifiers.length,
    },
    suap: publicSuap,
  };
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return 3000;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return 3000;
  }

  return port;
}

function parseBoolean(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

function parseOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseList(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEmailList(value: string | undefined): readonly string[] {
  return [...new Set(parseList(value).map((item) => item.toLowerCase()))];
}

export function isEmailAllowed(
  email: string,
  allowedEmails: readonly string[],
): boolean {
  const normalized = email.trim().toLowerCase();

  return allowedEmails.some((entry) => {
    const rule = entry.trim().toLowerCase();

    if (rule.startsWith("@")) {
      return normalized.endsWith(rule);
    }

    return normalized === rule;
  });
}

function parseUserRoles(
  value: string | undefined,
  fallback: readonly UserRole[],
): readonly UserRole[] {
  const roles = parseList(value).filter(isUserRole);
  return roles.length > 0 ? [...new Set(roles)] : fallback;
}

function parseCorsOrigins(value: string | undefined): readonly string[] {
  const origins = new Set<string>();

  for (const item of parseList(value)) {
    try {
      const url = new URL(item);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        continue;
      }

      origins.add(url.origin);
    } catch {
      // Invalid origins are ignored rather than widening the allowlist.
    }
  }

  return [...origins];
}

function parseCookieSameSite(value: string | undefined): CookieSameSite {
  switch ((value ?? "").trim().toLowerCase()) {
    case "strict":
      return "Strict";
    case "none":
      return "None";
    case "lax":
    default:
      return "Lax";
  }
}

function deriveSuapUrl(
  baseUrl: string | undefined,
  pathname: string,
): string | undefined {
  const normalized = parseOptionalString(baseUrl);
  if (!normalized) {
    return undefined;
  }

  return new URL(pathname, normalized).toString();
}

function parseWindowDays(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 365) {
    return 30;
  }

  return parsed;
}

function parseTimeoutMs(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 120_000) {
    return 30_000;
  }

  return parsed;
}

function parseCacheTtlMs(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3_600_000) {
    return 300_000;
  }

  return parsed;
}

function parseAbsenceConfirmationSyncs(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    return 2;
  }

  return parsed;
}

function parseDurationMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 86_400_000) {
    return fallback;
  }

  return parsed;
}

function parseWindowMinutes(
  value: string | undefined,
  fallback: string,
): number {
  const match = value?.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  const source = match ? match : fallback.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!source) {
    return 7 * 60;
  }

  return Number(source[1]) * 60 + Number(source[2]);
}

function buildSyncWindow(
  startMinutes: number,
  endMinutes: number,
): { windowStartMinutes: number; windowEndMinutes: number } {
  if (endMinutes > startMinutes) {
    return { windowStartMinutes: startMinutes, windowEndMinutes: endMinutes };
  }

  return { windowStartMinutes: 0, windowEndMinutes: 24 * 60 };
}

function parseRetentionDays(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3650) {
    return 90;
  }

  return parsed;
}

function parseReservationProvider(
  value: string | undefined,
): ReservationProviderName {
  if (value === "api" || value === "web-readonly" || value === "local") {
    return value;
  }

  return "local";
}

function parseReservationStore(
  value: string | undefined,
): ReservationStoreName {
  if (value === "firestore" || value === "memory") {
    return value;
  }

  return "memory";
}

function parseKeyCatalogStore(value: string | undefined): KeyCatalogStoreName {
  if (value === "firestore" || value === "memory") {
    return value;
  }

  return "memory";
}

function parseKeyMovementStore(
  value: string | undefined,
): KeyMovementStoreName {
  if (value === "firestore" || value === "memory") {
    return value;
  }

  return "memory";
}

function parseKeyOccurrenceStore(
  value: string | undefined,
): KeyOccurrenceStoreName {
  if (value === "firestore" || value === "memory") {
    return value;
  }

  return "memory";
}

function parseUserStore(value: string | undefined): UserStoreName {
  if (value === "firestore" || value === "memory") {
    return value;
  }

  return "memory";
}

function parseAuthSessionStore(
  value: string | undefined,
): AuthSessionStoreName {
  if (value === "firestore" || value === "memory") {
    return value;
  }

  return "memory";
}

function parseAuthMode(value: string | undefined): AuthMode {
  if (
    value === "trusted-header" ||
    value === "session" ||
    value === "firebase"
  ) {
    return value;
  }

  return "disabled";
}

function isUserRole(value: string): value is UserRole {
  return value === "usuario" || value === "portaria" || value === "admin";
}

function parseReservationBlockBeforeMinutes(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 240) {
    return 30;
  }

  return parsed;
}

function parseRoomScheduleWindowDays(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 180) {
    return 7;
  }

  return parsed;
}

function parseRoomScheduleMaxRooms(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 200) {
    return 5;
  }

  return parsed;
}

function parsePinDigits(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 4 || parsed > 20) {
    return fallback;
  }

  return parsed;
}

function parsePinMaxAttempts(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    return 5;
  }

  return parsed;
}
