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

export interface SuapReportTableRow {
  readonly cells: readonly string[];
  readonly links: readonly { text: string; href: string }[];
}

type SuapReportTableRowInput = readonly string[] | SuapReportTableRow;

export function parseSuapReportRowsFromTableCells(
  headers: readonly string[],
  rows: readonly SuapReportTableRowInput[],
  sourceUrl?: string
): readonly SuapReportRow[] {
  return rows
    .map((row) => parseSuapReportRowFromCells(headers, row, sourceUrl))
    .filter((row): row is SuapReportRow => Boolean(row));
}

export function parseSuapReportRowFromCells(
  headers: readonly string[],
  input: SuapReportTableRowInput,
  sourceUrl?: string
): SuapReportRow | undefined {
  const row: MutableSuapReportRow = {};
  const cells = isReportTableRow(input) ? input.cells : input;
  const links = isReportTableRow(input) ? input.links : [];

  headers.forEach((header, index) => {
    const field = HEADER_TO_FIELD.get(normalizeHeader(header));
    if (!field) {
      return;
    }

    row[field] = normalizeCell(cells[index] ?? "");
  });

  const requestUrl = findRequestUrl(links, sourceUrl);
  const requestExternalId = extractRequestExternalId(requestUrl);
  if (requestUrl) {
    row.sourceUrl = requestUrl;
  }
  if (requestExternalId) {
    row.requestExternalId = requestExternalId;
  }

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

function isReportTableRow(
  input: SuapReportTableRowInput
): input is SuapReportTableRow {
  return !Array.isArray(input);
}

function findRequestUrl(
  links: readonly { text: string; href: string }[],
  sourceUrl: string | undefined
): string | undefined {
  const link = links.find(
    (item) => /\/comum\/sala\/ver_solicitacao\/\d+\/?/i.test(item.href)
  );
  if (!link?.href) {
    return undefined;
  }

  return sourceUrl ? new URL(link.href, sourceUrl).toString() : link.href;
}

function extractRequestExternalId(value: string | undefined): string | undefined {
  return value?.match(/\/comum\/sala\/ver_solicitacao\/(\d+)\/?/i)?.[1];
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
