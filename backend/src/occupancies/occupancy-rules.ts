import type { NormalizedOccupancy, OccupancyStatus } from "./types.js";

const BLOCKING_STATUSES = new Set<OccupancyStatus>([
  "active",
  "changed",
  "conflicted"
]);

export function occupancyBlocksKey(
  occupancy: Pick<NormalizedOccupancy, "status">
): boolean {
  return BLOCKING_STATUSES.has(occupancy.status);
}

export function isActiveBlockingOccupancy(
  occupancy: Pick<
    NormalizedOccupancy,
    "status" | "blocksKey" | "startsAt" | "endsAt"
  >,
  at: Date
): boolean {
  return (
    occupancy.blocksKey &&
    occupancyBlocksKey(occupancy) &&
    isInsideOccupancyInterval(at, occupancy.startsAt, occupancy.endsAt)
  );
}

export function isInsideOccupancyInterval(
  at: Date,
  startsAt: string,
  endsAt: string
): boolean {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  return at >= start && at < end;
}
