import type { AppConfig } from "../../src/config/env.js";

export function createTestAppConfig(
  overrides: Partial<AppConfig> = {}
): AppConfig {
  const base = {
    nodeEnv: "test",
    port: 3000,
    externalEnvPath: "/tmp/.env",
    externalEnvLoaded: true,
    reservationProvider: "web-readonly" as const,
    reservationStore: {
      name: "memory" as const,
      cacheTtlMs: 300_000,
      absenceConfirmationSyncs: 2,
      syncEventRetentionDays: 90,
      firestoreConfigured: false,
      reservationsCollection: "reservations",
      syncEventsCollection: "reservation_sync_events"
    },
    reservationSyncSchedule: {
      enabled: false,
      intervalMs: 900_000,
      backoffMinMs: 60_000,
      backoffMaxMs: 1_800_000
    },
    keyControl: {
      reservationBlockBeforeMinutes: 30
    },
    firebaseRuntime: {},
    suapRuntime: {
      baseUrl: "https://suap.example.edu.br",
      loginUrl: "https://suap.example.edu.br/accounts/login/",
      username: "credential-login",
      password: "credential-password",
      reservationReportUrl:
        "https://suap.example.edu.br/comum/sala/reservasala_relat/"
    },
    suap: {
      baseUrlConfigured: true,
      loginUrlConfigured: true,
      usernameConfigured: true,
      passwordConfigured: true,
      webLoginConfigured: true,
      webReadonlyEnabled: true,
      reservationReportUrl:
        "https://suap.example.edu.br/comum/sala/reservasala_relat/",
      reservationReportUrlConfigured: true,
      reservationSyncWindowDays: 15,
      reservationStartTime: "07:00",
      reservationEndTime: "17:00",
      reservationCampusId: "27",
      reservationStatus: "deferida",
      browserHeadless: true,
      browserTimeoutMs: 30_000,
      reservationRoomUrls: [],
      reservationRoomUrlCount: 0,
      reservationTargetsConfigured: true
    }
  } satisfies AppConfig;

  return {
    ...base,
    ...overrides,
    reservationStore: {
      ...base.reservationStore,
      ...overrides.reservationStore
    },
    reservationSyncSchedule: {
      ...base.reservationSyncSchedule,
      ...overrides.reservationSyncSchedule
    },
    keyControl: {
      ...base.keyControl,
      ...overrides.keyControl
    },
    firebaseRuntime: {
      ...base.firebaseRuntime,
      ...overrides.firebaseRuntime
    },
    suapRuntime: {
      ...base.suapRuntime,
      ...overrides.suapRuntime
    },
    suap: {
      ...base.suap,
      ...overrides.suap
    }
  };
}
