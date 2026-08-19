import { HttpError } from "../http/errors.js";
import type { KeyOperationalStatus } from "./types.js";

export function isKeyOperationalStatus(
  value: unknown
): value is KeyOperationalStatus {
  return (
    value === "disponivel" ||
    value === "bloqueada_por_reserva" ||
    value === "retirada" ||
    value === "em_manutencao" ||
    value === "perdida" ||
    value === "danificada"
  );
}

export function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "invalid_input", `Campo '${field}' e obrigatorio.`);
  }

  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function uniqueRefs(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeCatalogId(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (!normalized) {
    throw new HttpError(400, "invalid_input", "Identificador invalido.");
  }

  return normalized;
}
