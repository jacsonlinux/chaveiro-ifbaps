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
import { withDerivedStatus } from "./key-movement.service.js";
import type { KeyMovementStatus } from "./key-movement.store.js";

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

export interface KeyOpenMovementProvider {
  findOpenByKey(keyId: string): Promise<
    | {
        readonly status: KeyMovementStatus;
        readonly expectedReturnAt?: string;
      }
    | undefined
  >;
}

type KeyCatalogSource = KeyCatalog | KeyCatalogProvider;

export class KeyAvailabilityService {
  constructor(
    private readonly reservationProvider: ReservationProvider,
    _options: KeyAvailabilityOptions,
    private readonly catalogSource?: KeyCatalogSource,
    private readonly openMovementProvider?: KeyOpenMovementProvider
  ) {
    void _options;
  }

  async listAvailability(at = new Date()): Promise<readonly KeyAvailability[]> {
    const reservations = await this.reservationProvider.list({});
    const occupancies = reservationsToOccupancies(reservations);
    const localCatalog = await this.resolveCatalog();
    const catalog =
      localCatalog.keys.length > 0
        ? activeCatalog(localCatalog)
        : createProvisionalCatalog(reservations);

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
        const openMovement = await this.openMovementProvider?.findOpenByKey(
          key.id
        );

        return {
          key,
          rooms,
          status: getEffectiveStatus(
            key.baseStatus,
            blockingReservation,
            at,
            openMovement
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
  const roomsById = new Map<string, Room>();
  const keys: PhysicalKey[] = [];
  const links: { keyId: string; roomId: string }[] = [];

  for (const reservation of reservations) {
    if (
      reservation.status !== "active" &&
      reservation.status !== "changed" &&
      reservation.status !== "conflicted"
    ) {
      continue;
    }

    const roomId = createRoomId(reservation);
    if (roomsById.has(roomId)) {
      continue;
    }

    const roomRef = reservation.roomExternalId ?? reservation.roomName;
    const room = {
      id: roomId,
      name: reservation.roomName,
      campus: reservation.campus,
      externalRefs: [roomRef, reservation.roomName],
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
  const rooms: Room[] = scrapedRooms.map((room) => ({
    id: room.externalId,
    name: room.name,
    campus: room.campus,
    building: room.building,
    floor: room.floor,
    schedulable: room.schedulable,
    active: true,
    externalRefs: [room.externalId, room.name],
    provisional: false,
    source: "suap-web",
    sourceUrl: room.sourceUrl,
    firstSeenAt: room.firstSeenAt,
    lastSeenAt: room.lastSeenAt
  }));
  const keys = rooms.map((room) => ({
    id: `key-${room.id}`,
    code: room.id,
    label: `Chave ${room.name}`,
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
    [room.name, ...room.externalRefs].map((ref) => normalizeRef(ref))
  );

  return (
    refs.has(normalizeRef(occupancy.roomName)) ||
    Boolean(
      occupancy.roomExternalId &&
        refs.has(normalizeRef(occupancy.roomExternalId))
    )
  );
}

function getEffectiveStatus(
  baseStatus: KeyOperationalStatus,
  blockingReservation: BlockingReservation | undefined,
  at: Date,
  openMovement?: Awaited<ReturnType<KeyOpenMovementProvider["findOpenByKey"]>>
): KeyOperationalStatus {
  if (
    openMovement &&
    withDerivedStatus(openMovement, at).status === "atrasada"
  ) {
    return "atrasada";
  }

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

function createRoomId(reservation: NormalizedReservation): string {
  const ref = reservation.roomExternalId ?? reservation.roomName;
  return (
    normalizeRef(ref).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "sala-sem-identificador"
  );
}
