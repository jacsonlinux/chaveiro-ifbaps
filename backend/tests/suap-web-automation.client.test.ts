import { describe, expect, it } from "vitest";
import { createTestAppConfig } from "./helpers/app-config.js";
import {
  selectRoomsForScheduleScrape,
  SuapWebAutomationClient
} from "../src/reservations/suap-web-automation.client.js";
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

  it("selects only active schedulable rooms with schedule urls for controlled schedule scraping", () => {
    const rooms = selectRoomsForScheduleScrape(
      [
        createRoom("1281", { roomCode: "A06" }),
        createRoom("1282", { roomCode: "A07", active: false }),
        createRoom("1283", { roomCode: "A08", schedulable: false }),
        createRoom("1284", { roomCode: "A09", scheduleUrl: undefined }),
        createRoom("1304", { roomCode: "C08" })
      ],
      1
    );

    expect(rooms.map((room) => room.externalId)).toEqual(["1281"]);
  });
});

function createRoom(
  externalId: string,
  overrides: Partial<Parameters<typeof selectRoomsForScheduleScrape>[0][number]> = {}
): Parameters<typeof selectRoomsForScheduleScrape>[0][number] {
  return {
    externalId,
    roomCode: "A06",
    name: "A06 - SALA DE AULA - Bloco A (PS)",
    campus: "PS",
    building: "Bloco A",
    active: true,
    schedulable: true,
    scheduleUrl: `https://suap.example.edu.br/comum/sala/solicitar_reserva/${externalId}/`,
    sourceUrl: "https://suap.example.edu.br/admin/comum/sala/",
    firstSeenAt: "2026-07-29T10:00:00.000Z",
    lastSeenAt: "2026-07-29T10:00:00.000Z",
    ...overrides
  };
}
