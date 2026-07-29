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
  const buildingIndex = findIndex(normalizedHeaders, [
    "campus / predio",
    "predio",
    "edificio"
  ]);
  const floorIndex = findIndex(normalizedHeaders, ["pavimento", "andar"]);
  const activeIndex = findIndex(normalizedHeaders, ["ativa", "ativo"]);
  const schedulableIndex = findIndex(normalizedHeaders, ["agendavel"]);
  const parsed = new Map<string, ScrapedSuapRoom>();

  for (const row of rows) {
    const externalId = findRoomId(row.links);
    const name = clean(
      nameIndex >= 0 ? row.cells[nameIndex] : row.links[0]?.text ?? row.cells[0]
    );
    if (!externalId || !name) continue;

    const campusAndBuilding = valueAt(row.cells, buildingIndex);
    const scheduleUrl = findScheduleUrl(row.links, sourceUrl);
    const schedulable = parseBooleanCell(row.cells[schedulableIndex], true);
    const active = parseBooleanCell(row.cells[activeIndex], true);
    parsed.set(externalId, {
      externalId,
      roomCode: extractRoomCode(name),
      name,
      campus: extractCampus(campusAndBuilding),
      building: extractBuilding(campusAndBuilding),
      floor: valueAt(row.cells, floorIndex),
      active,
      schedulable,
      scheduleUrl,
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

function findScheduleUrl(
  links: readonly { text: string; href: string }[],
  sourceUrl: string
): string | undefined {
  const link = links.find(
    (item) =>
      /\/comum\/sala\/solicitar_reserva\/\d+\/?/i.test(item.href) ||
      normalize(item.text).includes("solicitar/ver reservas")
  );
  if (!link?.href) {
    return undefined;
  }

  return new URL(link.href, sourceUrl).toString();
}

function findIndex(headers: readonly string[], names: readonly string[]): number {
  return headers.findIndex((header) => names.some((name) => header.includes(name)));
}

function valueAt(cells: readonly string[], index: number): string | undefined {
  return index >= 0 ? clean(cells[index]) || undefined : undefined;
}

function parseBooleanCell(value: string | undefined, defaultValue: boolean): boolean {
  if (isFalse(value)) {
    return false;
  }
  if (isTrue(value)) {
    return true;
  }
  return defaultValue;
}

function isFalse(value: string | undefined): boolean {
  return ["nao", "não", "false", "0", "inativo"].includes(normalize(value ?? ""));
}

function isTrue(value: string | undefined): boolean {
  return ["sim", "true", "1", "ativo", "ativa"].includes(normalize(value ?? ""));
}

function extractCampus(value: string | undefined): string | undefined {
  const parts = splitCampusBuilding(value);
  return parts.campus;
}

function extractBuilding(value: string | undefined): string | undefined {
  const parts = splitCampusBuilding(value);
  return parts.building ?? valueAt([value ?? ""], 0);
}

function splitCampusBuilding(value: string | undefined): {
  readonly campus?: string;
  readonly building?: string;
} {
  const normalized = clean(value);
  if (!normalized.includes("/")) {
    return {};
  }

  const [campus, ...buildingParts] = normalized.split("/");
  return {
    campus: clean(campus) || undefined,
    building: clean(buildingParts.join("/")) || undefined
  };
}

function extractRoomCode(name: string): string | undefined {
  const match = clean(name).match(/^([A-Z]{1,4}\d{1,4}[A-Z]?)(?:\b|\s|-)/i);
  return match?.[1]?.toUpperCase();
}

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value: string): string {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
