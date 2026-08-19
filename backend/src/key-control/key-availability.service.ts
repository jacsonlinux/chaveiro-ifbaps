import type {
  NormalizedReservation,
  ReservationProvider
} from "../reservations/types.js";
import type { ScrapedSuapRoom } from "../reservations/types.js";
import {
  isActiveBlockingOccupancy,
  isInsideOccupancyInterval
} from "../occupancies/occupancy-rules.js";
import {
  reservationsToOccupancies
} from "../occupancies/reservation-occupancy.mapper.js";
import {
  listOccupanciesFromSource,
  type OccupancySource
} from "../occupancies/occupancy-provider.js";
import type { NormalizedOccupancy } from "../occupancies/types.js";
import type {
  BlockingReservation,
  KeyAvailability,
  KeyCatalog,
  KeyOperationalStatus,
  PhysicalKey,
  ReservationAttention,
  Room
} from "./types.js";
import { compareRoomsByNaturalCode } from "./key-catalog-sort.js";

export interface KeyAvailabilityOptions {
  /**
   * Deprecated compatibility option. Occupancy blocking is chronological and
   * does not start before `startsAt`.
   */
  readonly blockBeforeMinutes: number;
}

export interface KeyCatalogProvider {
  getCatalog(): Promise<KeyCatalog>;
}

type KeyCatalogSource = KeyCatalog | KeyCatalogProvider;

export class KeyAvailabilityService {
  constructor(
    private readonly occupancySource: OccupancySource,
    _options: KeyAvailabilityOptions,
    private readonly catalogSource?: KeyCatalogSource
  ) {
    void _options;
  }

  async listAvailability(at = new Date()): Promise<readonly KeyAvailability[]> {
    const occupancies = await listOccupanciesFromSource(
      this.occupancySource,
      {}
    );
    const localCatalog = await this.resolveCatalog();
    const catalog =
      localCatalog.keys.length > 0
        ? activeCatalog(localCatalog)
        : createProvisionalCatalogFromOccupancies(occupancies);

    const availability = await Promise.all(
      catalog.keys.map(async (key) => {
        const rooms = getRoomsForKey(catalog, key);
        const blockingReservation = findBlockingReservation(
          rooms,
          occupancies,
          at
        );
        const reservationAttention = blockingReservation
          ? undefined
          : findReservationAttention(rooms, occupancies, at);

        return {
          key,
          rooms,
          status: getEffectiveStatus(
            key.baseStatus,
            blockingReservation
          ),
          blockingReservation,
          reservationAttention
        };
      })
    );

    return availability.filter((item) => item.rooms.length > 0);
  }

  private async resolveCatalog(): Promise<KeyCatalog> {
    if (!this.catalogSource) {
      return emptyCatalog();
    }

    if ("getCatalog" in this.catalogSource) {
      return this.catalogSource.getCatalog();
    }

    return this.catalogSource;
  }
}

export function emptyCatalog(): KeyCatalog {
  return {
    rooms: [],
    keys: [],
    links: []
  };
}

export function activeCatalog(catalog: KeyCatalog): KeyCatalog {
  const rooms = catalog.rooms.filter((room) => !room.disabledAt);
  const keys = catalog.keys.filter((key) => !key.disabledAt);
  const roomIds = new Set(rooms.map((room) => room.id));
  const keyIds = new Set(keys.map((key) => key.id));
  const links = catalog.links.filter(
    (link) =>
      !link.disabledAt && keyIds.has(link.keyId) && roomIds.has(link.roomId)
  );

  return { rooms, keys, links };
}

export function createProvisionalCatalog(
  reservations: readonly NormalizedReservation[]
): KeyCatalog {
  return createProvisionalCatalogFromOccupancies(
    reservationsToOccupancies(reservations)
  );
}

export function createProvisionalCatalogFromOccupancies(
  occupancies: readonly NormalizedOccupancy[]
): KeyCatalog {
  const roomsById = new Map<string, Room>();
  const keys: PhysicalKey[] = [];
  const links: { keyId: string; roomId: string }[] = [];

  for (const occupancy of occupancies) {
    if (!occupancy.blocksKey) {
      continue;
    }

    const roomId = createRoomId(occupancy);
    if (roomsById.has(roomId)) {
      continue;
    }

    const roomRef =
      occupancy.roomCode ?? occupancy.roomExternalId ?? occupancy.roomName;
    const room = {
      id: roomId,
      roomCode: occupancy.roomCode,
      name: occupancy.roomName,
      campus: occupancy.campus,
      externalRefs: [
        roomRef,
        ...(occupancy.roomExternalId ? [occupancy.roomExternalId] : []),
        occupancy.roomName
      ],
      provisional: true
    } satisfies Room;
    const key = {
      id: `key-${roomId}`,
      code: roomRef,
      label: `Chave ${roomRef}`,
      baseStatus: "disponivel",
      provisional: true
    } satisfies PhysicalKey;

    roomsById.set(roomId, room);
    keys.push(key);
    links.push({
      keyId: key.id,
      roomId: room.id
    });
  }

  return {
    rooms: [...roomsById.values()],
    keys,
    links
  };
}

export function createCatalogFromSuapRooms(
  scrapedRooms: readonly ScrapedSuapRoom[]
): KeyCatalog {
  const rooms: Room[] = scrapedRooms
    .map((room) => ({
      id: room.externalId,
      roomCode: room.roomCode,
      name: room.name,
      campus: room.campus,
      building: room.building,
      floor: room.floor,
      scheduleUrl: room.scheduleUrl,
      schedulable: room.schedulable,
      active: room.active,
      externalRefs: [
        room.externalId,
        ...(room.roomCode ? [room.roomCode] : []),
        room.name
      ],
      provisional: false,
      source: "suap-web",
      sourceUrl: room.sourceUrl,
      firstSeenAt: room.firstSeenAt,
      lastSeenAt: room.lastSeenAt
    }))
    .sort(compareRoomsByNaturalCode);
  const keys = rooms.map((room) => ({
    id: `key-${room.id}`,
    code: room.roomCode ?? room.id,
    label: `Chave ${room.roomCode ?? room.name}`,
    baseStatus: "disponivel" as const,
    provisional: true
  }));

  return {
    rooms,
    keys,
    links: keys.map((key, index) => ({
      keyId: key.id,
      roomId: rooms[index].id
    }))
  };
}

function getRoomsForKey(catalog: KeyCatalog, key: PhysicalKey): readonly Room[] {
  const roomIds = new Set(
    catalog.links
      .filter((link) => link.keyId === key.id)
      .map((link) => link.roomId)
  );

  return catalog.rooms.filter((room) => roomIds.has(room.id));
}

function findBlockingReservation(
  rooms: readonly Room[],
  occupancies: readonly NormalizedOccupancy[],
  at: Date
): BlockingReservation | undefined {
  const matching = occupancies
    .filter((occupancy) =>
      rooms.some((room) => occupancyMatchesRoom(room, occupancy))
    )
    .filter((occupancy) => isActiveBlockingOccupancy(occupancy, at))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));

  const occupancy = matching[0];
  if (!occupancy) {
    return undefined;
  }

  return {
    externalId: occupancy.externalId,
    roomName: occupancy.roomName,
    startsAt: occupancy.startsAt,
    endsAt: occupancy.endsAt,
    status: occupancy.status
  };
}

function findReservationAttention(
  rooms: readonly Room[],
  occupancies: readonly NormalizedOccupancy[],
  at: Date
): ReservationAttention | undefined {
  const matching = occupancies
    .filter((occupancy) => occupancy.status === "suspect_absent")
    .filter((occupancy) =>
      rooms.some((room) => occupancyMatchesRoom(room, occupancy))
    )
    .filter((occupancy) =>
      isInsideOccupancyInterval(at, occupancy.startsAt, occupancy.endsAt)
    )
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));

  const occupancy = matching[0];
  if (!occupancy) {
    return undefined;
  }

  return {
    externalId: occupancy.externalId,
    roomName: occupancy.roomName,
    startsAt: occupancy.startsAt,
    endsAt: occupancy.endsAt,
    status: "suspect_absent"
  };
}

function occupancyMatchesRoom(
  room: Room,
  occupancy: NormalizedOccupancy
): boolean {
  const refs = new Set(
    [room.name, ...(room.roomCode ? [room.roomCode] : []), ...room.externalRefs]
      .map((ref) => normalizeRef(ref))
  );

  return (
    refs.has(normalizeRef(occupancy.roomName)) ||
    Boolean(occupancy.roomCode && refs.has(normalizeRef(occupancy.roomCode))) ||
    Boolean(
      occupancy.roomExternalId &&
        refs.has(normalizeRef(occupancy.roomExternalId))
    )
  );
}

function getEffectiveStatus(
  baseStatus: KeyOperationalStatus,
  blockingReservation: BlockingReservation | undefined
): KeyOperationalStatus {
  if (baseStatus !== "disponivel") {
    return baseStatus;
  }

  return blockingReservation ? "bloqueada_por_reserva" : "disponivel";
}

function normalizeRef(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function createRoomId(
  source: Pick<NormalizedOccupancy, "roomCode" | "roomExternalId" | "roomName">
): string {
  const ref = source.roomExternalId ?? source.roomCode ?? source.roomName;
  return (
    normalizeRef(ref).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "sala-sem-identificador"
  );
}
