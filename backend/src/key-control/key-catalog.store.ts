import type {
  KeyCatalog,
  KeyOperationalStatus,
  KeyRoomLink,
  PhysicalKey,
  Room
} from "./types.js";
import type { KeyCatalogProvider } from "./key-availability.service.js";

export interface CreateRoomInput {
  readonly id?: string;
  readonly name: string;
  readonly campus?: string;
  readonly externalRefs?: readonly string[];
}

export interface CreateKeyInput {
  readonly id?: string;
  readonly code: string;
  readonly label?: string;
  readonly baseStatus?: KeyOperationalStatus;
}

export interface CreateKeyRoomLinkInput {
  readonly keyId: string;
  readonly roomId: string;
}

export interface UpdateKeyStatusInput {
  readonly keyId: string;
  readonly baseStatus: KeyOperationalStatus;
}

export interface KeyCatalogStore extends KeyCatalogProvider {
  readonly name: string;
  listRooms(): Promise<readonly Room[]>;
  createRoom(input: CreateRoomInput): Promise<Room>;
  listKeys(): Promise<readonly PhysicalKey[]>;
  createKey(input: CreateKeyInput): Promise<PhysicalKey>;
  updateKeyStatus(input: UpdateKeyStatusInput): Promise<PhysicalKey>;
  listLinks(): Promise<readonly KeyRoomLink[]>;
  createLink(input: CreateKeyRoomLinkInput): Promise<KeyRoomLink>;
  getCatalog(): Promise<KeyCatalog>;
}
