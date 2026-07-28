import { HttpError } from "../http/errors.js";
import type {
  CreateKeyInput,
  CreateKeyRoomLinkInput,
  CreateRoomInput,
  DisableKeyInput,
  DisableKeyRoomLinkInput,
  DisableRoomInput,
  KeyCatalogStore,
  ReactivateKeyInput,
  ReactivateKeyRoomLinkInput,
  ReactivateRoomInput,
  UpdateKeyStatusInput
} from "./key-catalog.store.js";
import type {
  KeyCatalog,
  KeyRoomLink,
  PhysicalKey,
  Room
} from "./types.js";
import {
  normalizeCatalogId,
  optionalString,
  requireNonEmpty,
  uniqueRefs
} from "./key-catalog-validation.js";

export class MemoryKeyCatalogStore implements KeyCatalogStore {
  readonly name = "memory";
  private readonly rooms = new Map<string, Room>();
  private readonly keys = new Map<string, PhysicalKey>();
  private readonly links = new Map<string, KeyRoomLink>();

  async listRooms(): Promise<readonly Room[]> {
    return [...this.rooms.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }

  async createRoom(input: CreateRoomInput): Promise<Room> {
    const name = requireNonEmpty(input.name, "name");
    const id = normalizeCatalogId(input.id ?? name);

    if (this.rooms.has(id)) {
      throw new HttpError(409, "room_already_exists", "Sala ja cadastrada.");
    }

    const externalRefs = uniqueRefs([
      ...(input.externalRefs ?? []),
      name,
      ...(input.id ? [input.id] : [])
    ]);
    const room = {
      id,
      name,
      campus: optionalString(input.campus),
      externalRefs
    } satisfies Room;

    this.rooms.set(id, room);
    return room;
  }

  async disableRoom(input: DisableRoomInput): Promise<Room> {
    const room = this.rooms.get(input.roomId);
    if (!room) {
      throw new HttpError(404, "room_not_found", "Sala nao encontrada.");
    }

    const updated = {
      ...room,
      disabledAt: input.disabledAt,
      disabledBy: optionalString(input.disabledBy),
      disabledReason: optionalString(input.disabledReason)
    } satisfies Room;

    this.rooms.set(input.roomId, updated);
    return updated;
  }

  async reactivateRoom(input: ReactivateRoomInput): Promise<Room> {
    const room = this.rooms.get(input.roomId);
    if (!room) {
      throw new HttpError(404, "room_not_found", "Sala nao encontrada.");
    }

    const { disabledAt, disabledBy, disabledReason, ...activeRoom } = room;
    this.rooms.set(input.roomId, activeRoom);
    return activeRoom;
  }

  async listKeys(): Promise<readonly PhysicalKey[]> {
    return [...this.keys.values()].sort((left, right) =>
      left.code.localeCompare(right.code)
    );
  }

  async createKey(input: CreateKeyInput): Promise<PhysicalKey> {
    const code = requireNonEmpty(input.code, "code");
    const id = normalizeCatalogId(input.id ?? code);

    if (this.keys.has(id)) {
      throw new HttpError(409, "key_already_exists", "Chave ja cadastrada.");
    }

    const key = {
      id,
      code,
      label: optionalString(input.label) ?? `Chave ${code}`,
      baseStatus: input.baseStatus ?? "disponivel"
    } satisfies PhysicalKey;

    this.keys.set(id, key);
    return key;
  }

  async disableKey(input: DisableKeyInput): Promise<PhysicalKey> {
    const key = this.keys.get(input.keyId);
    if (!key) {
      throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
    }

    const updated = {
      ...key,
      disabledAt: input.disabledAt,
      disabledBy: optionalString(input.disabledBy),
      disabledReason: optionalString(input.disabledReason)
    } satisfies PhysicalKey;

    this.keys.set(input.keyId, updated);
    return updated;
  }

  async reactivateKey(input: ReactivateKeyInput): Promise<PhysicalKey> {
    const key = this.keys.get(input.keyId);
    if (!key) {
      throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
    }

    const { disabledAt, disabledBy, disabledReason, ...activeKey } = key;
    this.keys.set(input.keyId, activeKey);
    return activeKey;
  }

  async updateKeyStatus(input: UpdateKeyStatusInput): Promise<PhysicalKey> {
    const key = this.keys.get(input.keyId);
    if (!key) {
      throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
    }

    const updated = {
      ...key,
      baseStatus: input.baseStatus
    } satisfies PhysicalKey;

    this.keys.set(input.keyId, updated);
    return updated;
  }

  async listLinks(): Promise<readonly KeyRoomLink[]> {
    return [...this.links.values()].sort((left, right) =>
      `${left.keyId}:${left.roomId}`.localeCompare(
        `${right.keyId}:${right.roomId}`
      )
    );
  }

  async createLink(input: CreateKeyRoomLinkInput): Promise<KeyRoomLink> {
    const keyId = requireNonEmpty(input.keyId, "keyId");
    const roomId = requireNonEmpty(input.roomId, "roomId");

    const key = this.keys.get(keyId);
    if (!key) {
      throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
    }

    if (key.disabledAt) {
      throw new HttpError(409, "key_disabled", "Chave desativada.");
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      throw new HttpError(404, "room_not_found", "Sala nao encontrada.");
    }

    if (room.disabledAt) {
      throw new HttpError(409, "room_disabled", "Sala desativada.");
    }

    const id = `${keyId}:${roomId}`;
    if (this.links.has(id)) {
      throw new HttpError(
        409,
        "key_room_link_already_exists",
        "Vinculo ja cadastrado."
      );
    }

    const link = { keyId, roomId } satisfies KeyRoomLink;

    this.links.set(id, link);
    return link;
  }

  async disableLink(input: DisableKeyRoomLinkInput): Promise<KeyRoomLink> {
    const id = `${input.keyId}:${input.roomId}`;
    const link = this.links.get(id);
    if (!link) {
      throw new HttpError(
        404,
        "key_room_link_not_found",
        "Vinculo nao encontrado."
      );
    }

    const updated = {
      ...link,
      disabledAt: input.disabledAt,
      disabledBy: optionalString(input.disabledBy),
      disabledReason: optionalString(input.disabledReason)
    } satisfies KeyRoomLink;

    this.links.set(id, updated);
    return updated;
  }

  async reactivateLink(
    input: ReactivateKeyRoomLinkInput
  ): Promise<KeyRoomLink> {
    const id = `${input.keyId}:${input.roomId}`;
    const link = this.links.get(id);
    if (!link) {
      throw new HttpError(
        404,
        "key_room_link_not_found",
        "Vinculo nao encontrado."
      );
    }

    const key = this.keys.get(input.keyId);
    if (!key) {
      throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
    }

    if (key.disabledAt) {
      throw new HttpError(409, "key_disabled", "Chave desativada.");
    }

    const room = this.rooms.get(input.roomId);
    if (!room) {
      throw new HttpError(404, "room_not_found", "Sala nao encontrada.");
    }

    if (room.disabledAt) {
      throw new HttpError(409, "room_disabled", "Sala desativada.");
    }

    const { disabledAt, disabledBy, disabledReason, ...activeLink } = link;
    this.links.set(id, activeLink);
    return activeLink;
  }

  async getCatalog(): Promise<KeyCatalog> {
    return {
      rooms: await this.listRooms(),
      keys: await this.listKeys(),
      links: await this.listLinks()
    };
  }
}
