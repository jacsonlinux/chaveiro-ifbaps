import type { AppConfig } from "../../src/config/env.js";

export function createTestAppConfig(
  overrides: Partial<AppConfig> = {},
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
      occupanciesCollection: "occupancies",
      syncEventsCollection: "reservation_sync_events",
    },
    reservationSyncSchedule: {
      enabled: false,
      intervalMs: 300_000,
      backoffMinMs: 60_000,
      backoffMaxMs: 1_800_000,
    },
    keyControl: {
      reservationBlockBeforeMinutes: 30,
    },
    keyCatalogStore: {
      name: "memory" as const,
      firestoreConfigured: false,
      roomsCollection: "rooms",
      keysCollection: "keys",
      linksCollection: "key_room_links",
    },
    keyMovementStore: {
      name: "memory" as const,
      firestoreConfigured: false,
      movementsCollection: "key_movements",
    },
    keyOccurrenceStore: {
      name: "memory" as const,
      firestoreConfigured: false,
      occurrencesCollection: "key_occurrences",
    },
    userStore: {
      name: "memory" as const,
      firestoreConfigured: false,
      usersCollection: "users",
    },
    authSessionStore: {
      name: "memory" as const,
      firestoreConfigured: false,
      sessionsCollection: "auth_sessions",
    },
    auth: {
      mode: "disabled" as const,
      required: false,
      sessionCookieName: "keychain_session",
      oauthStateCookieName: "keychain_oauth_state",
      sessionTtlMs: 28_800_000,
      cookieSecure: false,
      cookieSameSite: "Lax" as const,
      allowedEmails: [],
      defaultRoles: ["portaria"] as const,
      adminIdentifiers: [],
      portariaIdentifiers: [],
    },
    frontend: {
      baseUrl: "http://localhost:4200/",
    },
    cors: {
      enabled: false,
      allowedOrigins: [],
    },
    firebaseRuntime: {},
    suapRuntime: {
      baseUrl: "https://suap.example.edu.br",
      loginUrl: "https://suap.example.edu.br/accounts/login/",
      username: "credential-login",
      password: "credential-password",
      reservationReportUrl:
        "https://suap.example.edu.br/comum/sala/reservasala_relat/",
      roomsUrl:
        "https://suap.example.edu.br/admin/comum/sala/?agendavel__exact=1&all=&predio__uo=27",
    },
    suapOAuthRuntime: {
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:3000/auth/suap/callback",
      authorizeUrl: "https://suap.example.edu.br/o/authorize/",
      tokenUrl: "https://suap.example.edu.br/o/token/",
      meUrl: "https://suap.example.edu.br/api/eu/",
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
      roomScheduleSyncEnabled: false,
      roomScheduleSyncWindowDays: 7,
      roomScheduleSyncMaxRooms: 5,
      reservationRoomUrls: [],
      reservationRoomUrlCount: 0,
      reservationTargetsConfigured: true,
      oauthConfigured: true,
      oauthClientIdConfigured: true,
      oauthClientSecretConfigured: true,
      oauthRedirectUriConfigured: true,
      oauthAuthorizeUrlConfigured: true,
      oauthTokenUrlConfigured: true,
      oauthMeUrlConfigured: true,
      oauthScopeConfigured: false,
    },
  } satisfies AppConfig;

  return {
    ...base,
    ...overrides,
    reservationStore: {
      ...base.reservationStore,
      ...overrides.reservationStore,
    },
    reservationSyncSchedule: {
      ...base.reservationSyncSchedule,
      ...overrides.reservationSyncSchedule,
    },
    keyControl: {
      ...base.keyControl,
      ...overrides.keyControl,
    },
    keyCatalogStore: {
      ...base.keyCatalogStore,
      ...overrides.keyCatalogStore,
    },
    keyMovementStore: {
      ...base.keyMovementStore,
      ...overrides.keyMovementStore,
    },
    keyOccurrenceStore: {
      ...base.keyOccurrenceStore,
      ...overrides.keyOccurrenceStore,
    },
    userStore: {
      ...base.userStore,
      ...overrides.userStore,
    },
    authSessionStore: {
      ...base.authSessionStore,
      ...overrides.authSessionStore,
    },
    auth: {
      ...base.auth,
      ...overrides.auth,
    },
    frontend: {
      ...base.frontend,
      ...overrides.frontend,
    },
    cors: {
      ...base.cors,
      ...overrides.cors,
    },
    firebaseRuntime: {
      ...base.firebaseRuntime,
      ...overrides.firebaseRuntime,
    },
    suapRuntime: {
      ...base.suapRuntime,
      ...overrides.suapRuntime,
    },
    suapOAuthRuntime: {
      ...base.suapOAuthRuntime,
      ...overrides.suapOAuthRuntime,
    },
    suap: {
      ...base.suap,
      ...overrides.suap,
    },
  };
}
