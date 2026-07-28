import { describe, expect, it } from "vitest";
import {
  normalizeSuapReportRow,
  parseSuapPeriod
} from "../src/reservations/suap-report-normalizer.js";

describe("SUAP report normalizer", () => {
  it("parses table-style reservation periods", () => {
    expect(parseSuapPeriod("03/07/2026 | Horario: 14:00 - 17:00")).toEqual({
      startsAt: "2026-07-03T14:00:00.000-03:00",
      endsAt: "2026-07-03T17:00:00.000-03:00"
    });
  });

  it("parses prose-style reservation periods with accents", () => {
    expect(parseSuapPeriod("15:00 às 17:00 do dia 09/07/2026")).toEqual({
      startsAt: "2026-07-09T15:00:00.000-03:00",
      endsAt: "2026-07-09T17:00:00.000-03:00"
    });
  });

  it("normalizes sanitized report rows", () => {
    const reservation = normalizeSuapReportRow(
      {
        sala: "A06 - SALA DE AULA - Bloco A (PS)",
        solicitante: "Pessoa Exemplo",
        instituicaoSolicitante: "IFBA",
        dataSolicitacao: "05/02/2026 11:25",
        situacaoSolicitacao: "Deferida",
        periodo: "03/07/2026 | Horario: 14:00 - 17:00",
        previsaoPublico: "20",
        reservaCancelada: "Nao",
        gratuito: "Sim"
      },
      "2026-07-28T10:00:00.000Z"
    );

    expect(reservation).toMatchObject({
      source: "suap-web",
      roomName: "A06 - SALA DE AULA - Bloco A (PS)",
      roomExternalId: "A06",
      campus: "PS",
      startsAt: "2026-07-03T14:00:00.000-03:00",
      endsAt: "2026-07-03T17:00:00.000-03:00",
      responsibleName: "Pessoa Exemplo",
      status: "active",
      rawVersion: "suap-report-row-v1"
    });
    expect(reservation?.externalId).toMatch(/^suap-web-[a-f0-9]{24}$/);
    expect(reservation?.fingerprint).toHaveLength(64);
  });
});
