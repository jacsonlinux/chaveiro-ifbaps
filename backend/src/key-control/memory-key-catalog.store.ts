import { HttpError } from "../http/errors.js";
import type {
  CreateKeyInput,
  CreateKeyRoomLinkInput,
  CreateRoomInput,
  KeyCatalogStore
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

    if (!this.keys.has(keyId)) {
      throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
    }

    if (!this.rooms.has(roomId)) {
      throw new HttpError(404, "room_not_found", "Sala nao encontrada.");
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

  async getCatalog(): Promise<KeyCatalog> {
    return {
      rooms: await this.listRooms(),
      keys: await this.listKeys(),
      links: await this.listLinks()
    };
  }
}
