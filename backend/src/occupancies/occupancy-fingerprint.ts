import { createHash } from "node:crypto";
import type { NormalizedOccupancy } from "./types.js";

const FINGERPRINT_FIELDS = [
  "externalId",
  "source",
  "sourceKind",
  "roomName",
  "roomExternalId",
  "roomCode",
  "campus",
  "startsAt",
  "endsAt",
  "responsibleName",
  "responsibleIdentifier",
  "purpose",
  "status",
  "blocksKey"
] as const;

export type OccupancyFingerprintInput = Pick<
  NormalizedOccupancy,
  (typeof FINGERPRINT_FIELDS)[number]
>;

export function createOccupancyFingerprint(
  input: OccupancyFingerprintInput
): string {
  const payload = FINGERPRINT_FIELDS.map((field) => [
    field,
    normalizeValue(input[field])
  ]);

  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function normalizeValue(value: boolean | string | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}
