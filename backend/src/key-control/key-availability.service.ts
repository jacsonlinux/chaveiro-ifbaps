import type {
  NormalizedReservation,
  ReservationProvider
} from "../reservations/types.js";
import type {
  BlockingReservation,
  KeyAvailability,
  KeyCatalog,
  KeyOperationalStatus,
  PhysicalKey,
  Room
} from "./types.js";

export interface KeyAvailabilityOptions {
  readonly blockBeforeMinutes: number;
}

export interface KeyCatalogProvider {
  getCatalog(): Promise<KeyCatalog>;
}

type KeyCatalogSource = KeyCatalog | KeyCatalogProvider;

export class KeyAvailabilityService {
  constructor(
    private readonly reservationProvider: ReservationProvider,
    private readonly options: KeyAvailabilityOptions,
    private readonly catalogSource?: KeyCatalogSource
  ) {}

  async listAvailability(at = new Date()): Promise<readonly KeyAvailability[]> {
    const reservations = await this.reservationProvider.list({});
    const localCatalog = await this.resolveCatalog();
    const catalog =
      localCatalog.keys.length > 0
        ? localCatalog
        : createProvisionalCatalog(reservations);

    return catalog.keys.map((key) => {
      const rooms = getRoomsForKey(catalog, key);
      const blockingReservation = findBlockingReservation(
        rooms,
        reservations,
        at,
        this.options.blockBeforeMinutes
      );

      return {
        key,
        rooms,
        status: getEffectiveStatus(key.baseStatus, blockingReservation),
        blockingReservation
      };
    });
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
  reservations: Awaited<ReturnType<ReservationProvider["list"]>>,
  at: Date,
  blockBeforeMinutes: number
): BlockingReservation | undefined {
  const matching = reservations
    .filter((reservation) => isBlockingReservationStatus(reservation.status))
    .filter((reservation) =>
      rooms.some((room) => reservationMatchesRoom(room, reservation))
    )
    .filter((reservation) =>
      isInsideBlockingWindow(
        at,
        reservation.startsAt,
        reservation.endsAt,
        blockBeforeMinutes
      )
    )
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));

  const reservation = matching[0];
  if (!reservation) {
    return undefined;
  }

  return {
    externalId: reservation.externalId,
    roomName: reservation.roomName,
    startsAt: reservation.startsAt,
    endsAt: reservation.endsAt,
    status: reservation.status
  };
}

function reservationMatchesRoom(
  room: Room,
  reservation: Awaited<ReturnType<ReservationProvider["list"]>>[number]
): boolean {
  const refs = new Set(
    [room.name, ...room.externalRefs].map((ref) => normalizeRef(ref))
  );

  return (
    refs.has(normalizeRef(reservation.roomName)) ||
    Boolean(
      reservation.roomExternalId &&
        refs.has(normalizeRef(reservation.roomExternalId))
    )
  );
}

function isInsideBlockingWindow(
  at: Date,
  startsAt: string,
  endsAt: string,
  blockBeforeMinutes: number
): boolean {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const blockStart = new Date(start.getTime() - blockBeforeMinutes * 60_000);

  return at >= blockStart && at < end;
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

function isBlockingReservationStatus(
  status: NormalizedReservation["status"]
): boolean {
  return status === "active" || status === "changed" || status === "conflicted";
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
