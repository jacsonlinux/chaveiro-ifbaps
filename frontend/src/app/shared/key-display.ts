import type { PortariaOccupancyItem } from '../core/app-state.models';
import type { KeyAvailability } from '../app-models';

export function displayKeyCode(values: readonly (string | undefined)[]): string {
  for (const value of values) {
    if (!value) continue;
    const code = extractRoomCode(value);
    if (code) return code.toUpperCase();
  }
  return 'Sem codigo';
}

export function extractRoomCode(value: string): string | undefined {
  return value.match(/\b([A-Z]{1,3}\d{1,3})\b/i)?.[1]?.toUpperCase();
}

export function compareKeyAvailability(left: KeyAvailability, right: KeyAvailability): number {
  return compareRoomCodes(
    displayKeyCode([left.rooms[0]?.name, left.key.label, left.key.code]),
    displayKeyCode([right.rooms[0]?.name, right.key.label, right.key.code]),
  );
}

export function comparePortariaOccupancy(left: PortariaOccupancyItem, right: PortariaOccupancyItem): number {
  return compareRoomCodes(left.keyCode, right.keyCode) ||
    left.occupancy.startsAt.localeCompare(right.occupancy.startsAt);
}

export function compareRoomCodes(left: string, right: string): number {
  const leftParts = roomCodeParts(left);
  const rightParts = roomCodeParts(right);
  return leftParts.prefix.localeCompare(rightParts.prefix, 'pt-BR') ||
    leftParts.number - rightParts.number ||
    left.localeCompare(right, 'pt-BR', { numeric: true, sensitivity: 'base' });
}


function roomCodeParts(value: string): { readonly prefix: string; readonly number: number } {
  const match = value.match(/^([A-Z]+)(\d+)$/i);
  return {
    prefix: match?.[1]?.toUpperCase() ?? value.toUpperCase(),
    number: match?.[2] ? Number(match[2]) : Number.MAX_SAFE_INTEGER,
  };
}
