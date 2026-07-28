import { describe, expect, it } from "vitest";
import {
  buildFutureSuapReservationReportUrl,
  parseSuapReservationReportFilters
} from "../src/reservations/suap-reservation-report-url.js";

describe("SUAP reservation report url", () => {
  it("parses known report filters", () => {
    expect(
      parseSuapReservationReportFilters(
        "https://suap.ifba.edu.br/comum/sala/reservasala_relat/?data_inicio=01%2F07%2F2026&data_fim=31%2F07%2F2026&hora_inicio=07%3A00&hora_fim=17%3A00&campus=27&situacao=deferida&relatorioreservassalas_form=Aguarde..."
      )
    ).toEqual({
      dataInicio: "01/07/2026",
      dataFim: "31/07/2026",
      horaInicio: "07:00",
      horaFim: "17:00",
      campus: "27",
      situacao: "deferida"
    });
  });

  it("ignores unrelated pages", () => {
    expect(
      parseSuapReservationReportFilters(
        "https://suap.ifba.edu.br/comum/sala/solicitar_reserva/1281/"
      )
    ).toBeUndefined();
  });

  it("builds report urls from today forward, never from a past date", () => {
    const url = buildFutureSuapReservationReportUrl({
      baseUrl:
        "https://suap.ifba.edu.br/comum/sala/reservasala_relat/?data_inicio=01%2F07%2F2026&data_fim=31%2F07%2F2026",
      now: new Date("2026-07-28T12:00:00.000-03:00"),
      windowDays: 30,
      horaInicio: "07:00",
      horaFim: "17:00",
      campus: "27",
      situacao: "deferida"
    });

    expect(parseSuapReservationReportFilters(url)).toEqual({
      dataInicio: "28/07/2026",
      dataFim: "27/08/2026",
      horaInicio: "07:00",
      horaFim: "17:00",
      campus: "27",
      situacao: "deferida"
    });
  });
});
