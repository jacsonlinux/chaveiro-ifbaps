import type { ScrapedSuapRoom } from "./types.js";

export interface SuapRoomTableRow {
  readonly cells: readonly string[];
  readonly links: readonly { text: string; href: string }[];
}

export function parseSuapRoomTableRows(
  headers: readonly string[],
  rows: readonly SuapRoomTableRow[],
  sourceUrl: string,
  syncedAt: string
): readonly ScrapedSuapRoom[] {
  const normalizedHeaders = alignHeadersToCells(headers, rows[0]?.cells ?? []).map(normalize);
  const nameIndex = findIndex(normalizedHeaders, ["nome", "sala", "descricao"]);
  const buildingIndex = findIndex(normalizedHeaders, ["predio", "edificio"]);
  const floorIndex = findIndex(normalizedHeaders, ["pavimento", "andar"]);
  const schedulableIndex = findIndex(normalizedHeaders, ["agendavel"]);
  const parsed = new Map<string, ScrapedSuapRoom>();

  for (const row of rows) {
    const externalId = findRoomId(row.links);
    const name = clean(
      nameIndex >= 0 ? row.cells[nameIndex] : row.links[0]?.text ?? row.cells[0]
    );
    if (!externalId || !name) continue;

    const schedulable = schedulableIndex < 0 || !isFalse(row.cells[schedulableIndex]);
    parsed.set(externalId, {
      externalId,
      name,
      building: valueAt(row.cells, buildingIndex),
      floor: valueAt(row.cells, floorIndex),
      schedulable,
      sourceUrl,
      firstSeenAt: syncedAt,
      lastSeenAt: syncedAt
    });
  }

  return [...parsed.values()];
}

function alignHeadersToCells(
  headers: readonly string[],
  cells: readonly string[]
): readonly string[] {
  if (headers.length === cells.length + 1 && normalize(headers[0] ?? "") === "#") {
    return headers.slice(1);
  }
  return headers;
}

function findRoomId(links: readonly { href: string }[]): string | undefined {
  for (const link of links) {
    const match = link.href.match(/\/admin\/comum\/sala\/(\d+)(?:\/|$)/i);
    if (match) return match[1];
  }
  return undefined;
}

function findIndex(headers: readonly string[], names: readonly string[]): number {
  return headers.findIndex((header) => names.some((name) => header.includes(name)));
}

function valueAt(cells: readonly string[], index: number): string | undefined {
  return index >= 0 ? clean(cells[index]) || undefined : undefined;
}

function isFalse(value: string | undefined): boolean {
  return ["nao", "não", "false", "0", "inativo"].includes(normalize(value ?? ""));
}

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value: string): string {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
