import { existsSync, readFileSync } from "node:fs";

export type ReservationProviderName = "local" | "api" | "web-readonly";

export interface AppConfig {
  readonly nodeEnv: string;
  readonly port: number;
  readonly externalEnvPath: string;
  readonly externalEnvLoaded: boolean;
  readonly reservationProvider: ReservationProviderName;
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

function parseReservationProvider(
  value: string | undefined
): ReservationProviderName {
  if (value === "api" || value === "web-readonly" || value === "local") {
    return value;
  }

  return "local";
}
