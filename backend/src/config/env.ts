import { existsSync, readFileSync } from "node:fs";

export type ReservationProviderName = "local" | "api" | "web-readonly";

export interface AppConfig {
  readonly nodeEnv: string;
  readonly port: number;
  readonly externalEnvPath: string;
  readonly externalEnvLoaded: boolean;
  readonly reservationProvider: ReservationProviderName;
  readonly suap: {
    readonly baseUrlConfigured: boolean;
    readonly loginUrlConfigured: boolean;
    readonly usernameConfigured: boolean;
    readonly passwordConfigured: boolean;
    readonly webLoginConfigured: boolean;
    readonly webReadonlyEnabled: boolean;
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
    webReadonlyEnabled: parseBoolean(env.SUAP_WEB_READONLY_ENABLED)
  };

  return {
    nodeEnv: env.NODE_ENV || "development",
    port: parsePort(env.PORT),
    externalEnvPath,
    externalEnvLoaded: externalEnv.loaded,
    reservationProvider,
    suap: {
      ...suap,
      webLoginConfigured:
        suap.baseUrlConfigured &&
        suap.loginUrlConfigured &&
        suap.usernameConfigured &&
        suap.passwordConfigured
    }
  };
}

export function publicConfig(config: AppConfig): Record<string, unknown> {
  return {
    nodeEnv: config.nodeEnv,
    port: config.port,
    externalEnvPath: config.externalEnvPath,
    externalEnvLoaded: config.externalEnvLoaded,
    reservationProvider: config.reservationProvider,
    suap: config.suap
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

function parseReservationProvider(
  value: string | undefined
): ReservationProviderName {
  if (value === "api" || value === "web-readonly" || value === "local") {
    return value;
  }

  return "local";
}
