import { describe, expect, it } from "vitest";
import { SuapWebReadOnlyReservationProvider } from "../src/reservations/suap-web-readonly-reservation.provider.js";
import type { AppConfig } from "../src/config/env.js";

describe("SuapWebReadOnlyReservationProvider", () => {
  it("keeps scraping disabled behind feature flag", async () => {
    const provider = new SuapWebReadOnlyReservationProvider({
      ...createConfig(),
      suap: {
        ...createConfig().suap,
        webReadonlyEnabled: false
      }
    });

    await expect(provider.sync()).rejects.toMatchObject({
      statusCode: 503,
      code: "suap_web_readonly_disabled"
    });
  });
});

function createConfig(): AppConfig {
  return {
    nodeEnv: "test",
    port: 3000,
    externalEnvPath: "/tmp/.env",
    externalEnvLoaded: true,
    reservationProvider: "web-readonly",
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
  };
}
