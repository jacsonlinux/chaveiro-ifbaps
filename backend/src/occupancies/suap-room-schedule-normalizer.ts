import { createHash } from "node:crypto";
import { occupancyBlocksKey } from "./occupancy-rules.js";
import { createOccupancyFingerprint } from "./occupancy-fingerprint.js";
import type { NormalizedOccupancy, OccupancySourceKind } from "./types.js";

export interface SuapRoomScheduleTextInput {
  readonly text: string;
  readonly sourceUrl: string;
  readonly roomExternalId: string;
  readonly roomName: string;
  readonly roomCode?: string;
  readonly campus?: string;
  readonly syncedAt?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly defaultSourceKind?: OccupancySourceKind;
}

export interface ParsedSuapRoomScheduleEntry {
  readonly date: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly description: string;
}

const MONTHS = new Map([
  ["janeiro", 1],
  ["fevereiro", 2],
  ["marco", 3],
  ["abril", 4],
  ["maio", 5],
  ["junho", 6],
  ["julho", 7],
  ["agosto", 8],
  ["setembro", 9],
  ["outubro", 10],
  ["novembro", 11],
  ["dezembro", 12]
]);

export function normalizeSuapRoomScheduleText(
  input: SuapRoomScheduleTextInput
): readonly NormalizedOccupancy[] {
  const syncedAt = input.syncedAt ?? new Date().toISOString();
  const sourceKind = input.defaultSourceKind ?? "aula_regular";

  return parseSuapRoomScheduleEntries(input.text, {
    fromDate: input.fromDate,
    toDate: input.toDate
  }).map((entry) => {
    const base = {
      externalId: createExternalId(input, entry),
      source: "suap-web" as const,
      sourceKind,
      sourceUrl: input.sourceUrl,
      roomName: normalizeWhitespace(input.roomName),
      roomExternalId: input.roomExternalId,
      roomCode: input.roomCode,
      campus: input.campus,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      responsibleName: extractResponsibleName(entry.description),
      purpose: entry.description,
      status: "active" as const,
      blocksKey: occupancyBlocksKey({
        status: "active"
      }),
      firstSeenAt: syncedAt,
      lastSeenAt: syncedAt,
      lastSyncedAt: syncedAt,
      rawVersion: "suap-room-schedule-text-v1"
    };

    return {
      ...base,
      fingerprint: createOccupancyFingerprint(base)
    };
  });
}

export function parseSuapRoomScheduleEntries(
  text: string,
  options: {
    readonly fromDate?: string;
    readonly toDate?: string;
  } = {}
): readonly ParsedSuapRoomScheduleEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const entries: ParsedSuapRoomScheduleEntry[] = [];
  let currentMonth: number | undefined;
  let currentYear: number | undefined;
  let currentDate: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isScheduleFormBoundary(line)) {
      break;
    }

    const month = parseMonthHeader(line);
    if (month) {
      currentMonth = month.month;
      currentYear = month.year;
      currentDate = undefined;
      continue;
    }

    if (!currentMonth || !currentYear) {
      continue;
    }

    const day = parseDayLine(line);
    if (day) {
      currentDate = toIsoDate(currentYear, currentMonth, day);
      continue;
    }

    const timeRange = parseTimeRange(line);
    if (!currentDate || !timeRange) {
      continue;
    }

    const description = lines[index + 1];
    if (!description || looksLikeStructuralLine(description)) {
      continue;
    }

    const entry = {
      date: currentDate,
      startsAt: toIsoDateTime(currentDate, timeRange.startsAt),
      endsAt: toIsoDateTime(currentDate, timeRange.endsAt),
      description: normalizeWhitespace(description)
    };

    if (isInsideDateWindow(entry.date, options)) {
      entries.push(entry);
    }

    index += 1;
  }

  return entries;
}

function parseMonthHeader(
  value: string
): { readonly month: number; readonly year: number } | undefined {
  const match = value.match(/^([A-Za-zÀ-ÿ]+)\/(\d{4})$/);
  if (!match) {
    return undefined;
  }

  const month = MONTHS.get(normalizeKey(match[1]));
  if (!month) {
    return undefined;
  }

  return {
    month,
    year: Number(match[2])
  };
}

function parseDayLine(value: string): number | undefined {
  const normalized = normalizeKey(value).replace(/^hoje\s*/, "");
  if (!/^\d{1,2}$/.test(normalized)) {
    return undefined;
  }

  const day = Number(normalized);
  return day >= 1 && day <= 31 ? day : undefined;
}

function parseTimeRange(
  value: string
): { readonly startsAt: string; readonly endsAt: string } | undefined {
  const match = normalizeKey(value).match(
    /^(\d{2}:\d{2})\s*(?:as|a|-)\s*(\d{2}:\d{2})$/
  );
  if (!match) {
    return undefined;
  }

  return {
    startsAt: match[1],
    endsAt: match[2]
  };
}

function createExternalId(
  input: SuapRoomScheduleTextInput,
  entry: ParsedSuapRoomScheduleEntry
): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        input.sourceUrl,
        input.roomExternalId,
        input.roomCode,
        entry.startsAt,
        entry.endsAt,
        entry.description
      ])
    )
    .digest("hex")
    .slice(0, 24);

  return `suap-room-schedule-${input.roomExternalId}-${entry.date}-${hash}`;
}

function extractResponsibleName(description: string): string | undefined {
  const words = normalizeWhitespace(description).split(" ");
  const nameWords: string[] = [];

  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index].replace(/[.,;:!?()[\]]+$/g, "");
    if (isNameWord(word) || isNameConnector(word)) {
      nameWords.unshift(word);
      continue;
    }

    break;
  }

  const candidate = nameWords.join(" ").trim();
  return candidate.split(" ").filter((word) => !isNameConnector(word)).length >= 2
    ? candidate
    : undefined;
}

function isNameWord(value: string): boolean {
  return /^[A-ZÀ-Ý][A-Za-zÀ-ÿ']+$/.test(value);
}

function isNameConnector(value: string): boolean {
  return ["da", "de", "do", "das", "dos", "e"].includes(normalizeKey(value));
}

function isInsideDateWindow(
  date: string,
  options: { readonly fromDate?: string; readonly toDate?: string }
): boolean {
  if (options.fromDate && date < options.fromDate) {
    return false;
  }

  if (options.toDate && date > options.toDate) {
    return false;
  }

  return true;
}

function looksLikeStructuralLine(value: string): boolean {
  return Boolean(
    parseMonthHeader(value) ||
      parseDayLine(value) ||
      parseTimeRange(value) ||
      isWeekdayHeader(value) ||
      isScheduleFormBoundary(value)
  );
}

function isWeekdayHeader(value: string): boolean {
  return normalizeKey(value) === "dom seg ter qua qui sex sab";
}

function isScheduleFormBoundary(value: string): boolean {
  return normalizeKey(value).startsWith("formulario de solicitacao");
}

function toIsoDate(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function toIsoDateTime(date: string, time: string): string {
  return `${date}T${time}:00.000-03:00`;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string): string {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
