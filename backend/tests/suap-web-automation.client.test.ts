import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config/env.js";
import { SuapWebAutomationClient } from "../src/reservations/suap-web-automation.client.js";
import { parseSuapReservationReportFilters } from "../src/reservations/suap-reservation-report-url.js";

describe("SuapWebAutomationClient", () => {
  it("builds future report urls from provider config", () => {
    const client = new SuapWebAutomationClient(createConfig());
    const url = client.buildReportUrl(new Date("2026-07-28T09:00:00.000-03:00"));

    expect(parseSuapReservationReportFilters(url)).toEqual({
      dataInicio: "28/07/2026",
      dataFim: "12/08/2026",
      horaInicio: "07:00",
      horaFim: "17:00",
      campus: "27",
      situacao: "deferida"
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
