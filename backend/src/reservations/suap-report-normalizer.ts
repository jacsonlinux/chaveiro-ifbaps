import { createHash } from "node:crypto";
import { createReservationFingerprint } from "./fingerprint.js";
import type { NormalizedReservation, ReservationStatus } from "./types.js";

export interface SuapReportRow {
  readonly sala: string;
  readonly solicitante: string;
  readonly instituicaoSolicitante?: string;
  readonly dataSolicitacao?: string;
  readonly situacaoSolicitacao: string;
  readonly periodo: string;
  readonly previsaoPublico?: string;
  readonly reservaCancelada?: string;
  readonly gratuito?: string;
}

export interface ParsedSuapPeriod {
  readonly startsAt: string;
  readonly endsAt: string;
}

export function parseSuapPeriod(value: string): ParsedSuapPeriod | undefined {
  const normalized = normalizeText(value);
  const tableMatch = normalized.match(
    /^(\d{2}\/\d{2}\/\d{4})\s*\|\s*horario:\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/
  );

  if (tableMatch) {
    return {
      startsAt: toIsoDateTime(tableMatch[1], tableMatch[2]),
      endsAt: toIsoDateTime(tableMatch[1], tableMatch[3])
    };
  }

  const proseMatch = normalized.match(
    /^(\d{2}:\d{2})\s+(?:as|a)\s+(\d{2}:\d{2})\s+do dia\s+(\d{2}\/\d{2}\/\d{4})$/
  );

  if (proseMatch) {
    return {
      startsAt: toIsoDateTime(proseMatch[3], proseMatch[1]),
      endsAt: toIsoDateTime(proseMatch[3], proseMatch[2])
    };
  }

  return undefined;
}

export function normalizeSuapReportRow(
  row: SuapReportRow,
  syncedAt = new Date().toISOString()
): NormalizedReservation | undefined {
  const period = parseSuapPeriod(row.periodo);
  if (!period) {
    return undefined;
  }

  const status = normalizeReservationStatus(
    row.situacaoSolicitacao,
    row.reservaCancelada
  );
  const base = {
    externalId: createExternalId(row),
    source: "suap-web" as const,
    roomName: normalizeWhitespace(row.sala),
    roomExternalId: extractRoomExternalId(row.sala),
    campus: extractCampus(row.sala),
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    responsibleName: normalizeOptional(row.solicitante),
    purpose: normalizePurpose(row),
    status,
    firstSeenAt: syncedAt,
    lastSeenAt: syncedAt,
    lastSyncedAt: syncedAt,
    rawVersion: "suap-report-row-v1"
  };

  return {
    ...base,
    fingerprint: createReservationFingerprint(base)
  };
}

function normalizeReservationStatus(
  situacaoSolicitacao: string,
  reservaCancelada: string | undefined
): ReservationStatus {
  if (normalizeText(reservaCancelada ?? "") === "sim") {
    return "canceled";
  }

  if (normalizeText(situacaoSolicitacao) === "deferida") {
    return "active";
  }

  return "absent";
}

function normalizePurpose(row: SuapReportRow): string | undefined {
  const parts = [
    row.instituicaoSolicitante &&
    normalizeText(row.instituicaoSolicitante) !== "-"
      ? `Instituicao: ${normalizeWhitespace(row.instituicaoSolicitante)}`
      : undefined,
    row.previsaoPublico
      ? `Publico previsto: ${normalizeWhitespace(row.previsaoPublico)}`
      : undefined,
    row.gratuito ? `Gratuito: ${normalizeWhitespace(row.gratuito)}` : undefined
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("; ") : undefined;
}

function createExternalId(row: SuapReportRow): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        normalizeWhitespace(row.sala),
        normalizeWhitespace(row.solicitante),
        normalizeWhitespace(row.dataSolicitacao ?? ""),
        normalizeWhitespace(row.periodo)
      ])
    )
    .digest("hex")
    .slice(0, 24);

  return `suap-web-${hash}`;
}

function extractRoomExternalId(value: string): string | undefined {
  return normalizeWhitespace(value).match(/^([A-Za-z0-9]+)\s+-/)?.[1];
}

function extractCampus(value: string): string | undefined {
  return normalizeWhitespace(value).match(/\(([A-Z0-9]+)\)$/)?.[1];
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value ? normalizeWhitespace(value) : "";
  return normalized && normalizeText(normalized) !== "-" ? normalized : undefined;
}

function toIsoDateTime(date: string, time: string): string {
  const [day, month, year] = date.split("/");
  return `${year}-${month}-${day}T${time}:00.000-03:00`;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeText(value: string): string {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
