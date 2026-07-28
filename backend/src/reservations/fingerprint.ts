import { createHash } from "node:crypto";
import type { NormalizedReservation } from "./types.js";

const FINGERPRINT_FIELDS = [
  "externalId",
  "source",
  "roomName",
  "roomExternalId",
  "campus",
  "startsAt",
  "endsAt",
  "responsibleIdentifier",
  "purpose",
  "status"
] as const;

export type FingerprintInput = Pick<
  NormalizedReservation,
  (typeof FINGERPRINT_FIELDS)[number]
>;

export function createReservationFingerprint(input: FingerprintInput): string {
  const payload = FINGERPRINT_FIELDS.map((field) => [
    field,
    normalizeValue(input[field])
  ]);

  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function normalizeValue(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}
