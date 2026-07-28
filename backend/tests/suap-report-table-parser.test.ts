import { describe, expect, it } from "vitest";
import { parseSuapReportRowsFromTableCells } from "../src/reservations/suap-report-table-parser.js";

describe("SUAP report table parser", () => {
  it("maps report table cells to sanitized row objects", () => {
    expect(
      parseSuapReportRowsFromTableCells(
        [
          "Acoes",
          "Sala",
          "Solicitante",
          "Instituicao do solicitante",
          "Data da Solicitacao",
          "Situacao da Solicitacao",
          "Periodo",
          "Previsao de Publico",
          "Reserva Cancelada?",
          "Gratuito?"
        ],
        [
          [
            "Visualizar",
            "A06 - SALA DE AULA - Bloco A (PS)",
            "Pessoa Exemplo",
            "IFBA",
            "05/02/2026 11:25",
            "Deferida",
            "03/07/2026 | Horario: 14:00 - 17:00",
            "20",
            "Nao",
            "Sim"
          ]
        ]
      )
    ).toEqual([
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
      }
    ]);
  });

  it("ignores incomplete rows", () => {
    expect(
      parseSuapReportRowsFromTableCells(
        ["Sala", "Solicitante", "Situacao da Solicitacao", "Periodo"],
        [["A06", "", "Deferida", "03/07/2026 | Horario: 14:00 - 17:00"]]
      )
    ).toEqual([]);
  });
});
