import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAppConfig,
  parseDotEnv,
  publicConfig,
} from "../src/config/env.js";

describe("env config", () => {
  it("parses dotenv content without requiring external packages", () => {
    expect(
      parseDotEnv(`
        # comment
        PORT=3010
        RESERVATION_STORE=firestore
        export SUAP_RESERVATION_PROVIDER=web-readonly
        QUOTED="value with spaces"
      `),
    ).toEqual({
      PORT: "3010",
      RESERVATION_STORE: "firestore",
      SUAP_RESERVATION_PROVIDER: "web-readonly",
      QUOTED: "value with spaces",
    });
  });

  it("publishes only non-secret configuration", () => {
    const dir = mkdtempSync(join(tmpdir(), "keychain-env-"));
    const envPath = join(dir, ".env");
    writeFileSync(
      envPath,
      [
        "SUAP_URL=https://suap.example.edu.br",
        "SUAP_URL_LOGIN=https://suap.example.edu.br/accounts/login/",
        "SUAP_USERNAME=credential-login",
        "SUAP_PASSWD=credential-password",
        "RESERVATION_STORE=firestore",
        "RESERVATION_CACHE_TTL_MS=120000",
        "RESERVATION_ABSENCE_CONFIRMATION_SYNCS=3",
        "RESERVATION_SYNC_EVENT_RETENTION_DAYS=45",
        "RESERVATION_SYNC_SCHEDULE_ENABLED=true",
        "RESERVATION_SYNC_INTERVAL_MS=600000",
        "RESERVATION_SYNC_BACKOFF_MIN_MS=30000",
        "RESERVATION_SYNC_BACKOFF_MAX_MS=900000",
        "KEY_RESERVATION_BLOCK_MINUTES=45",
        "FIREBASE_SERVICE_ACCOUNT_PATH=/external/service-account.json",
        "FIRESTORE_RESERVATIONS_COLLECTION=suap_reservations",
        "FIRESTORE_OCCUPANCIES_COLLECTION=suap_occupancies",
        "FIRESTORE_SYNC_EVENTS_COLLECTION=suap_sync_events",
        "KEY_CATALOG_STORE=firestore",
        "FIRESTORE_ROOMS_COLLECTION=key_rooms",
        "FIRESTORE_KEYS_COLLECTION=physical_keys",
        "FIRESTORE_KEY_ROOM_LINKS_COLLECTION=key_room_links_custom",
        "KEY_MOVEMENT_STORE=firestore",
        "FIRESTORE_KEY_MOVEMENTS_COLLECTION=key_movements_custom",
        "KEY_OCCURRENCE_STORE=firestore",
        "FIRESTORE_KEY_OCCURRENCES_COLLECTION=key_occurrences_custom",
        "USER_STORE=firestore",
        "FIRESTORE_USERS_COLLECTION=app_users",
        "AUTH_MODE=session",
        "AUTH_SESSION_COOKIE_NAME=custom_session",
        "AUTH_OAUTH_STATE_COOKIE_NAME=custom_oauth_state",
        "AUTH_SESSION_TTL_MS=3600000",
        "AUTH_COOKIE_SECURE=true",
        "AUTH_COOKIE_SAME_SITE=none",
        "AUTH_ALLOWED_EMAILS=jacsonlinux@gmail.com",
        "AUTH_DEFAULT_ROLES=portaria",
        "AUTH_ADMIN_IDENTIFIERS=admin-user,admin@example.edu.br",
        "AUTH_PORTARIA_IDENTIFIERS=portaria-user",
        "AUTH_SESSION_STORE=firestore",
        "FIRESTORE_AUTH_SESSIONS_COLLECTION=app_sessions",
        "APP_FRONTEND_URL=http://localhost:4200/",
        "CORS_ALLOWED_ORIGINS=https://keychain-ifbaps.web.app http://localhost:4200/",
        "SUAP_CLIENT_ID=oauth-client-id",
        "SUAP_CLIENT_SECRET=oauth-client-secret",
        "SUAP_REDIRECT_URI=http://localhost:3000/auth/suap/callback",
        "SUAP_AUTHORIZE_URL=https://suap.example.edu.br/o/authorize/",
        "SUAP_TOKEN_URL=https://suap.example.edu.br/o/token/",
        "SUAP_ME_URL=https://suap.example.edu.br/api/eu/",
        "SUAP_OAUTH_SCOPE=identificacao email",
        "SUAP_RESERVATION_REPORT_URL=https://suap.example.edu.br/comum/sala/reservasala_relat/",
        "SUAP_ROOMS_URL=https://suap.example.edu.br/admin/comum/sala/?agendavel__exact=1&all=&predio__uo=27",
        "SUAP_RESERVATION_SYNC_WINDOW_DAYS=15",
        "SUAP_RESERVATION_START_TIME=08:00",
        "SUAP_RESERVATION_END_TIME=18:00",
        "SUAP_RESERVATION_CAMPUS_ID=27",
        "SUAP_RESERVATION_STATUS=deferida",
        "SUAP_BROWSER_HEADLESS=false",
        "SUAP_BROWSER_TIMEOUT_MS=45000",
        "SUAP_ROOM_SCHEDULE_SYNC_ENABLED=true",
        "SUAP_ROOM_SCHEDULE_SYNC_WINDOW_DAYS=10",
        "SUAP_ROOM_SCHEDULE_SYNC_MAX_ROOMS=8",
        "SUAP_RESERVATION_ROOM_URLS=https://suap.example.edu.br/comum/sala/solicitar_reserva/1281/,https://suap.example.edu.br/comum/sala/solicitar_reserva/1283/",
      ].join("\n"),
    );

    try {
      const config = createAppConfig({
        EXTERNAL_ENV_PATH: envPath,
        SUAP_RESERVATION_PROVIDER: "local",
      });
      const safe = publicConfig(config);

      expect(safe).toMatchObject({
        externalEnvLoaded: true,
        reservationProvider: "local",
        reservationStore: {
          name: "firestore",
          cacheTtlMs: 120000,
          absenceConfirmationSyncs: 3,
          syncEventRetentionDays: 45,
          firestoreConfigured: true,
          reservationsCollection: "suap_reservations",
          occupanciesCollection: "suap_occupancies",
          syncEventsCollection: "suap_sync_events",
        },
        reservationSyncSchedule: {
          enabled: true,
          intervalMs: 600000,
          backoffMinMs: 30000,
          backoffMaxMs: 900000,
        },
        keyControl: {
          reservationBlockBeforeMinutes: 45,
        },
        keyCatalogStore: {
          name: "firestore",
          firestoreConfigured: true,
          roomsCollection: "key_rooms",
          keysCollection: "physical_keys",
          linksCollection: "key_room_links_custom",
        },
        keyMovementStore: {
          name: "firestore",
          firestoreConfigured: true,
          movementsCollection: "key_movements_custom",
        },
        keyOccurrenceStore: {
          name: "firestore",
          firestoreConfigured: true,
          occurrencesCollection: "key_occurrences_custom",
        },
        userStore: {
          name: "firestore",
          firestoreConfigured: true,
          usersCollection: "app_users",
        },
        authSessionStore: {
          name: "firestore",
          firestoreConfigured: true,
          sessionsCollection: "app_sessions",
        },
        frontend: {
          baseUrl: "http://localhost:4200/",
        },
        cors: {
          enabled: true,
          allowedOrigins: [
            "https://keychain-ifbaps.web.app",
            "http://localhost:4200",
          ],
        },
        auth: {
          mode: "session",
          required: true,
          sessionCookieName: "custom_session",
          oauthStateCookieName: "custom_oauth_state",
          sessionTtlMs: 3600000,
          cookieSecure: true,
          cookieSameSite: "None",
          allowedEmailCount: 1,
          defaultRoles: ["portaria"],
          adminIdentifierCount: 2,
          portariaIdentifierCount: 1,
        },
        suap: {
          webLoginConfigured: true,
          passwordConfigured: true,
          reservationReportUrlConfigured: true,
          reservationSyncWindowDays: 15,
          reservationStartTime: "08:00",
          reservationEndTime: "18:00",
          reservationCampusId: "27",
          reservationStatus: "deferida",
          browserHeadless: false,
          browserTimeoutMs: 45000,
          roomScheduleSyncEnabled: true,
          roomScheduleSyncWindowDays: 10,
          roomScheduleSyncMaxRooms: 8,
          reservationRoomUrlCount: 2,
          reservationTargetsConfigured: true,
          oauthConfigured: true,
          oauthClientIdConfigured: true,
          oauthClientSecretConfigured: true,
          oauthRedirectUriConfigured: true,
          oauthAuthorizeUrlConfigured: true,
          oauthTokenUrlConfigured: true,
          oauthMeUrlConfigured: true,
          oauthScopeConfigured: true,
        },
      });
      expect(JSON.stringify(safe)).not.toContain("credential-login");
      expect(JSON.stringify(safe)).not.toContain("credential-password");
      expect(JSON.stringify(safe)).not.toContain("oauth-client-id");
      expect(JSON.stringify(safe)).not.toContain("oauth-client-secret");
      expect(JSON.stringify(safe)).not.toContain("admin@example.edu.br");
      expect(JSON.stringify(safe)).not.toContain("reservasala_relat");
      expect(JSON.stringify(safe)).not.toContain("solicitar_reserva/1281");
      expect(JSON.stringify(safe)).not.toContain("credential-login");
      expect(JSON.stringify(safe)).not.toContain("credential-password");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
