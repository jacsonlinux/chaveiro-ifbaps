import { describe, expect, it } from "vitest";
import { createTestAppConfig } from "./helpers/app-config.js";
import { SuapWebAutomationClient } from "../src/reservations/suap-web-automation.client.js";
import { parseSuapReservationReportFilters } from "../src/reservations/suap-reservation-report-url.js";

describe("SuapWebAutomationClient", () => {
  it("builds future report urls from provider config", () => {
    const client = new SuapWebAutomationClient(createTestAppConfig());
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
