import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAppConfig, parseDotEnv, publicConfig } from "../src/config/env.js";

describe("env config", () => {
  it("parses dotenv content without requiring external packages", () => {
    expect(
      parseDotEnv(`
        # comment
        PORT=3010
        export SUAP_RESERVATION_PROVIDER=web-readonly
        QUOTED="value with spaces"
      `)
    ).toEqual({
      PORT: "3010",
      SUAP_RESERVATION_PROVIDER: "web-readonly",
      QUOTED: "value with spaces"
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
        "SUAP_RESERVATION_REPORT_URL=https://suap.example.edu.br/comum/sala/reservasala_relat/",
        "SUAP_RESERVATION_SYNC_WINDOW_DAYS=15",
        "SUAP_RESERVATION_START_TIME=08:00",
        "SUAP_RESERVATION_END_TIME=18:00",
        "SUAP_RESERVATION_CAMPUS_ID=27",
        "SUAP_RESERVATION_STATUS=deferida",
        "SUAP_BROWSER_HEADLESS=false",
        "SUAP_BROWSER_TIMEOUT_MS=45000",
        "SUAP_RESERVATION_ROOM_URLS=https://suap.example.edu.br/comum/sala/solicitar_reserva/1281/,https://suap.example.edu.br/comum/sala/solicitar_reserva/1283/"
      ].join("\n")
    );

    try {
      const config = createAppConfig({
        EXTERNAL_ENV_PATH: envPath,
        SUAP_RESERVATION_PROVIDER: "local"
      });
      const safe = publicConfig(config);

      expect(safe).toMatchObject({
        externalEnvLoaded: true,
        reservationProvider: "local",
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
          reservationRoomUrlCount: 2,
          reservationTargetsConfigured: true
        }
      });
      expect(JSON.stringify(safe)).not.toContain("credential-login");
      expect(JSON.stringify(safe)).not.toContain("credential-password");
      expect(JSON.stringify(safe)).not.toContain("reservasala_relat");
      expect(JSON.stringify(safe)).not.toContain("solicitar_reserva/1281");
      expect(JSON.stringify(safe)).not.toContain("credential-login");
      expect(JSON.stringify(safe)).not.toContain("credential-password");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
