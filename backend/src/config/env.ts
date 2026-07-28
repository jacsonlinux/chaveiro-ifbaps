import { existsSync, readFileSync } from "node:fs";

export type ReservationProviderName = "local" | "api" | "web-readonly";
export type ReservationStoreName = "memory" | "firestore";
export type KeyCatalogStoreName = "memory" | "firestore";
export type KeyMovementStoreName = "memory" | "firestore";
export type AuthMode = "disabled" | "trusted-header";

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
    readonly syncEventsCollection: string;
  };
  readonly reservationSyncSchedule: {
    readonly enabled: boolean;
    readonly intervalMs: number;
    readonly backoffMinMs: number;
    readonly backoffMaxMs: number;
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
  readonly auth: {
    readonly mode: AuthMode;
    readonly required: boolean;
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
  };
  readonly suap: {
    readonly baseUrlConfigured: boolean;
    readonly loginUrlConfigured: boolean;
    readonly usernameConfigured: boolean;
    readonly passwordConfigured: boolean;
    readonly webLoginConfigured: boolean;
    readonly webReadonlyEnabled: boolean;
    readonly reservationReportUrl?: string;
    readonly reservationReportUrlConfigured: boolean;
    readonly reservationSyncWindowDays: number;
    readonly reservationStartTime: string;
    readonly reservationEndTime: string;
    readonly reservationCampusId?: string;
    readonly reservationStatus: string;
    readonly browserHeadless: boolean;
    readonly browserTimeoutMs: number;
    readonly reservationRoomUrls: readonly string[];
    readonly reservationRoomUrlCount: number;
    readonly reservationTargetsConfigured: boolean;
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

export function loadExternalEnv(
  path = DEFAULT_EXTERNAL_ENV_PATH
): { loaded: boolean; values: Record<string, string> } {
  if (!existsSync(path)) {
    return { loaded: false, values: {} };
  }

  return {
    loaded: true,
    values: parseDotEnv(readFileSync(path, "utf8"))
  };
}

export function createAppConfig(processEnv: EnvMap = process.env): AppConfig {
  const externalEnvPath =
    processEnv.EXTERNAL_ENV_PATH?.trim() || DEFAULT_EXTERNAL_ENV_PATH;
  const externalEnv = loadExternalEnv(externalEnvPath);
  const env = { ...externalEnv.values, ...processEnv };

  const reservationProvider = parseReservationProvider(
    env.SUAP_RESERVATION_PROVIDER
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
    reservationSyncWindowDays: parseWindowDays(
      env.SUAP_RESERVATION_SYNC_WINDOW_DAYS
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
    reservationRoomUrls: parseList(env.SUAP_RESERVATION_ROOM_URLS)
  };

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
        env.RESERVATION_ABSENCE_CONFIRMATION_SYNCS
      ),
      syncEventRetentionDays: parseRetentionDays(
        env.RESERVATION_SYNC_EVENT_RETENTION_DAYS
      ),
      firestoreConfigured: Boolean(serviceAccountPath),
      reservationsCollection:
        parseOptionalString(env.FIRESTORE_RESERVATIONS_COLLECTION) ??
        "reservations",
      syncEventsCollection:
        parseOptionalString(env.FIRESTORE_SYNC_EVENTS_COLLECTION) ??
        "reservation_sync_events"
    },
    reservationSyncSchedule: {
      enabled: parseBoolean(env.RESERVATION_SYNC_SCHEDULE_ENABLED),
      intervalMs: parseDurationMs(env.RESERVATION_SYNC_INTERVAL_MS, 900_000),
      backoffMinMs: parseDurationMs(
        env.RESERVATION_SYNC_BACKOFF_MIN_MS,
        60_000
      ),
      backoffMaxMs: parseDurationMs(
        env.RESERVATION_SYNC_BACKOFF_MAX_MS,
        1_800_000
      )
    },
    keyControl: {
      reservationBlockBeforeMinutes: parseReservationBlockBeforeMinutes(
        env.KEY_RESERVATION_BLOCK_MINUTES
      )
    },
    keyCatalogStore: {
      name: parseKeyCatalogStore(env.KEY_CATALOG_STORE),
      firestoreConfigured: Boolean(serviceAccountPath),
      roomsCollection:
        parseOptionalString(env.FIRESTORE_ROOMS_COLLECTION) ?? "rooms",
      keysCollection: parseOptionalString(env.FIRESTORE_KEYS_COLLECTION) ?? "keys",
      linksCollection:
        parseOptionalString(env.FIRESTORE_KEY_ROOM_LINKS_COLLECTION) ??
        "key_room_links"
    },
    keyMovementStore: {
      name: parseKeyMovementStore(env.KEY_MOVEMENT_STORE),
      firestoreConfigured: Boolean(serviceAccountPath),
      movementsCollection:
        parseOptionalString(env.FIRESTORE_KEY_MOVEMENTS_COLLECTION) ??
        "key_movements"
    },
    auth: {
      mode: authMode,
      required: authMode !== "disabled"
    },
    firebaseRuntime: {
      serviceAccountPath
    },
    suapRuntime: {
      baseUrl: parseOptionalString(env.SUAP_URL),
      loginUrl: parseOptionalString(env.SUAP_URL_LOGIN),
      username: parseOptionalString(env.SUAP_USERNAME),
      password: parseOptionalString(env.SUAP_PASSWD),
      reservationReportUrl: suap.reservationReportUrl
    },
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
        Boolean(suap.reservationReportUrl) || suap.reservationRoomUrls.length > 0
    }
  };
}

export function publicConfig(config: AppConfig): Record<string, unknown> {
  const {
    reservationReportUrl: _reservationReportUrl,
    reservationRoomUrls: _reservationRoomUrls,
    ...publicSuap
  } = config.suap;

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
    auth: config.auth,
    suap: publicSuap
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

function parseRetentionDays(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3650) {
    return 90;
  }

  return parsed;
}

function parseReservationProvider(
  value: string | undefined
): ReservationProviderName {
  if (value === "api" || value === "web-readonly" || value === "local") {
    return value;
  }

  return "local";
}

function parseReservationStore(value: string | undefined): ReservationStoreName {
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

function parseKeyMovementStore(value: string | undefined): KeyMovementStoreName {
  if (value === "firestore" || value === "memory") {
    return value;
  }

  return "memory";
}

function parseAuthMode(value: string | undefined): AuthMode {
  if (value === "trusted-header") {
    return value;
  }

  return "disabled";
}

function parseReservationBlockBeforeMinutes(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 240) {
    return 30;
  }

  return parsed;
}
