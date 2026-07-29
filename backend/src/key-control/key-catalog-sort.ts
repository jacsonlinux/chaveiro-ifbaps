import type { PhysicalKey, Room } from "./types.js";

const catalogCollator = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base"
});

export function compareRoomsByNaturalCode(left: Room, right: Room): number {
  return compareNatural(
    left.roomCode ?? left.name ?? left.id,
    right.roomCode ?? right.name ?? right.id
  );
}

export function compareKeysByNaturalCode(
  left: PhysicalKey,
  right: PhysicalKey
): number {
  return compareNatural(left.code, right.code);
}

function compareNatural(left: string, right: string): number {
  return catalogCollator.compare(left, right);
}
