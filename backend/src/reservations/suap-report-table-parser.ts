import type { SuapReportRow } from "./suap-report-normalizer.js";

const HEADER_TO_FIELD = new Map<SuapReportHeader, keyof SuapReportRow>([
  ["sala", "sala"],
  ["solicitante", "solicitante"],
  ["instituicao do solicitante", "instituicaoSolicitante"],
  ["data da solicitacao", "dataSolicitacao"],
  ["situacao da solicitacao", "situacaoSolicitacao"],
  ["periodo", "periodo"],
  ["previsao de publico", "previsaoPublico"],
  ["reserva cancelada?", "reservaCancelada"],
  ["gratuito?", "gratuito"]
]);

type SuapReportHeader =
  | "sala"
  | "solicitante"
  | "instituicao do solicitante"
  | "data da solicitacao"
  | "situacao da solicitacao"
  | "periodo"
  | "previsao de publico"
  | "reserva cancelada?"
  | "gratuito?";

type MutableSuapReportRow = {
  -readonly [Key in keyof SuapReportRow]?: SuapReportRow[Key];
};

export function parseSuapReportRowsFromTableCells(
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): readonly SuapReportRow[] {
  return rows
    .map((cells) => parseSuapReportRowFromCells(headers, cells))
    .filter((row): row is SuapReportRow => Boolean(row));
}

export function parseSuapReportRowFromCells(
  headers: readonly string[],
  cells: readonly string[]
): SuapReportRow | undefined {
  const row: MutableSuapReportRow = {};

  headers.forEach((header, index) => {
    const field = HEADER_TO_FIELD.get(normalizeHeader(header));
    if (!field) {
      return;
    }

    row[field] = normalizeCell(cells[index] ?? "");
  });

  if (
    !row.sala ||
    !row.solicitante ||
    !row.situacaoSolicitacao ||
    !row.periodo
  ) {
    return undefined;
  }

  return row as SuapReportRow;
}

function normalizeHeader(value: string): SuapReportHeader {
  return normalizeCell(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase() as SuapReportHeader;
}

function normalizeCell(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
