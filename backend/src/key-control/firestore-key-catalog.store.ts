import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  type CollectionReference,
  type DocumentData,
  type Firestore
} from "firebase-admin/firestore";
import type { AppConfig } from "../config/env.js";
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
  UpdateKeyInput,
  UpdateRoomInput,
  UpdateKeyStatusInput
} from "./key-catalog.store.js";
import {
  normalizeCatalogId,
  optionalString,
  requireNonEmpty,
  uniqueRefs
} from "./key-catalog-validation.js";
import {
  compareKeysByNaturalCode,
  compareRoomsByNaturalCode
} from "./key-catalog-sort.js";
import type {
  KeyCatalog,
  KeyRoomLink,
  PhysicalKey,
  Room
} from "./types.js";

export class FirestoreKeyCatalogStore implements KeyCatalogStore {
  readonly name = "firestore";
  private readonly db: Firestore;
  private readonly rooms: CollectionReference<DocumentData>;
  private readonly keys: CollectionReference<DocumentData>;
  private readonly links: CollectionReference<DocumentData>;

  constructor(private readonly config: AppConfig) {
    const serviceAccountPath = config.firebaseRuntime.serviceAccountPath;
    if (!serviceAccountPath) {
      throw new HttpError(
        503,
        "firebase_service_account_not_configured",
        "Service account do Firebase nao configurada."
      );
    }

    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert(serviceAccountPath)
      });
    this.db = getFirestore(app);
    this.rooms = this.db.collection(config.keyCatalogStore.roomsCollection);
    this.keys = this.db.collection(config.keyCatalogStore.keysCollection);
    this.links = this.db.collection(config.keyCatalogStore.linksCollection);
  }

  async listRooms(): Promise<readonly Room[]> {
    const snapshot = await this.rooms.get();
    return snapshot.docs
      .map((doc) => doc.data() as Room)
      .sort(compareRoomsByNaturalCode);
  }

  async createRoom(input: CreateRoomInput): Promise<Room> {
    const name = requireNonEmpty(input.name, "name");
    const id = normalizeCatalogId(input.id ?? name);
    const ref = this.rooms.doc(id);
    const snapshot = await ref.get();

    if (snapshot.exists) {
      throw new HttpError(409, "room_already_exists", "Sala ja cadastrada.");
    }

    const room = {
      id,
      name,
      campus: optionalString(input.campus),
      externalRefs: uniqueRefs([
        ...(input.externalRefs ?? []),
        name,
        ...(input.id ? [input.id] : [])
      ])
    } satisfies Room;

    await ref.set(stripUndefined(room));
    return room;
  }

  async updateRoom(input: UpdateRoomInput): Promise<Room> {
    const ref = this.rooms.doc(input.roomId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new HttpError(404, "room_not_found", "Sala nao encontrada.");
    }

    const room = snapshot.data() as Room;
    const name = input.name ? requireNonEmpty(input.name, "name") : room.name;
    const refs = input.externalRefs ?? room.externalRefs ?? [];
    const updated = {
      ...room,
      name,
      campus: optionalString(input.campus) ?? room.campus,
      externalRefs: uniqueRefs([...refs, name, room.id]),
      updatedAt: input.updatedAt,
      updatedBy: optionalString(input.updatedBy)
    } satisfies Room;

    await ref.set(stripUndefined(updated), { merge: true });
    return updated;
  }

  async disableRoom(input: DisableRoomInput): Promise<Room> {
    const ref = this.rooms.doc(input.roomId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new HttpError(404, "room_not_found", "Sala nao encontrada.");
    }

    const room = snapshot.data() as Room;
    const updated = {
      ...room,
      disabledAt: input.disabledAt,
      disabledBy: optionalString(input.disabledBy),
      disabledReason: optionalString(input.disabledReason)
    } satisfies Room;

    await ref.set(stripUndefined(updated), { merge: true });
    return updated;
  }

  async reactivateRoom(input: ReactivateRoomInput): Promise<Room> {
    const ref = this.rooms.doc(input.roomId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new HttpError(404, "room_not_found", "Sala nao encontrada.");
    }

    const activeRoom = omitDisabledFields(snapshot.data() as Room);
    await ref.update(disabledFieldDeletes());
    return activeRoom;
  }

  async listKeys(): Promise<readonly PhysicalKey[]> {
    const snapshot = await this.keys.get();
    return snapshot.docs
      .map((doc) => doc.data() as PhysicalKey)
      .sort(compareKeysByNaturalCode);
  }

  async createKey(input: CreateKeyInput): Promise<PhysicalKey> {
    const code = requireNonEmpty(input.code, "code");
    const id = normalizeCatalogId(input.id ?? code);
    const ref = this.keys.doc(id);
    const snapshot = await ref.get();

    if (snapshot.exists) {
      throw new HttpError(409, "key_already_exists", "Chave ja cadastrada.");
    }

    const key = {
      id,
      code,
      label: optionalString(input.label) ?? `Chave ${code}`,
      baseStatus: input.baseStatus ?? "disponivel"
    } satisfies PhysicalKey;

    await ref.set(stripUndefined(key));
    return key;
  }

  async updateKey(input: UpdateKeyInput): Promise<PhysicalKey> {
    const ref = this.keys.doc(input.keyId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
    }

    const key = snapshot.data() as PhysicalKey;
    const code = input.code ? requireNonEmpty(input.code, "code") : key.code;
    const updated = {
      ...key,
      code,
      label: optionalString(input.label) ?? key.label,
      baseStatus: input.baseStatus ?? key.baseStatus,
      updatedAt: input.updatedAt,
      updatedBy: optionalString(input.updatedBy)
    } satisfies PhysicalKey;

    await ref.set(stripUndefined(updated), { merge: true });
    return updated;
  }

  async disableKey(input: DisableKeyInput): Promise<PhysicalKey> {
    const ref = this.keys.doc(input.keyId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
    }

    const key = snapshot.data() as PhysicalKey;
    const updated = {
      ...key,
      disabledAt: input.disabledAt,
      disabledBy: optionalString(input.disabledBy),
      disabledReason: optionalString(input.disabledReason)
    } satisfies PhysicalKey;

    await ref.set(stripUndefined(updated), { merge: true });
    return updated;
  }

  async reactivateKey(input: ReactivateKeyInput): Promise<PhysicalKey> {
    const ref = this.keys.doc(input.keyId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
    }

    const activeKey = omitDisabledFields(snapshot.data() as PhysicalKey);
    await ref.update(disabledFieldDeletes());
    return activeKey;
  }

  async updateKeyStatus(input: UpdateKeyStatusInput): Promise<PhysicalKey> {
    const ref = this.keys.doc(input.keyId);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
    }

    const key = snapshot.data() as PhysicalKey;
    const updated = {
      ...key,
      baseStatus: input.baseStatus
    } satisfies PhysicalKey;

    await ref.set(stripUndefined(updated), { merge: true });
    return updated;
  }

  async listLinks(): Promise<readonly KeyRoomLink[]> {
    const snapshot = await this.links.get();
    return snapshot.docs
      .map((doc) => doc.data() as KeyRoomLink)
      .sort((left, right) =>
        `${left.keyId}:${left.roomId}`.localeCompare(
          `${right.keyId}:${right.roomId}`
        )
      );
  }

  async createLink(input: CreateKeyRoomLinkInput): Promise<KeyRoomLink> {
    const keyId = requireNonEmpty(input.keyId, "keyId");
    const roomId = requireNonEmpty(input.roomId, "roomId");
    const [key, room] = await Promise.all([
      this.keys.doc(keyId).get(),
      this.rooms.doc(roomId).get()
    ]);

    if (!key.exists) {
      throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
    }

    if (!room.exists) {
      throw new HttpError(404, "room_not_found", "Sala nao encontrada.");
    }

    const keyData = key.data() as PhysicalKey;
    if (keyData.disabledAt) {
      throw new HttpError(409, "key_disabled", "Chave desativada.");
    }

    const roomData = room.data() as Room;
    if (roomData.disabledAt) {
      throw new HttpError(409, "room_disabled", "Sala desativada.");
    }

    const ref = this.links.doc(toLinkDocumentId(keyId, roomId));
    const snapshot = await ref.get();
    if (snapshot.exists) {
      throw new HttpError(
        409,
        "key_room_link_already_exists",
        "Vinculo ja cadastrado."
      );
    }

    const link = { keyId, roomId } satisfies KeyRoomLink;

    await ref.set(link);
    return link;
  }

  async disableLink(input: DisableKeyRoomLinkInput): Promise<KeyRoomLink> {
    const ref = this.links.doc(toLinkDocumentId(input.keyId, input.roomId));
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new HttpError(
        404,
        "key_room_link_not_found",
        "Vinculo nao encontrado."
      );
    }

    const link = snapshot.data() as KeyRoomLink;
    const updated = {
      ...link,
      disabledAt: input.disabledAt,
      disabledBy: optionalString(input.disabledBy),
      disabledReason: optionalString(input.disabledReason)
    } satisfies KeyRoomLink;

    await ref.set(stripUndefined(updated), { merge: true });
    return updated;
  }

  async reactivateLink(
    input: ReactivateKeyRoomLinkInput
  ): Promise<KeyRoomLink> {
    const ref = this.links.doc(toLinkDocumentId(input.keyId, input.roomId));
    const [link, key, room] = await Promise.all([
      ref.get(),
      this.keys.doc(input.keyId).get(),
      this.rooms.doc(input.roomId).get()
    ]);

    if (!link.exists) {
      throw new HttpError(
        404,
        "key_room_link_not_found",
        "Vinculo nao encontrado."
      );
    }

    if (!key.exists) {
      throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
    }

    const keyData = key.data() as PhysicalKey;
    if (keyData.disabledAt) {
      throw new HttpError(409, "key_disabled", "Chave desativada.");
    }

    if (!room.exists) {
      throw new HttpError(404, "room_not_found", "Sala nao encontrada.");
    }

    const roomData = room.data() as Room;
    if (roomData.disabledAt) {
      throw new HttpError(409, "room_disabled", "Sala desativada.");
    }

    const activeLink = omitDisabledFields(link.data() as KeyRoomLink);
    await ref.update(disabledFieldDeletes());
    return activeLink;
  }

  async getCatalog(): Promise<KeyCatalog> {
    const [rooms, keys, links] = await Promise.all([
      this.listRooms(),
      this.listKeys(),
      this.listLinks()
    ]);

    return {
      rooms,
      keys,
      links
    };
  }
}

function toLinkDocumentId(keyId: string, roomId: string): string {
  return encodeURIComponent(`${keyId}:${roomId}`);
}

function stripUndefined(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined)
  );
}

function omitDisabledFields<T extends object>(value: T): T {
  const { disabledAt, disabledBy, disabledReason, ...activeValue } = value as T & {
    disabledAt?: string;
    disabledBy?: string;
    disabledReason?: string;
  };

  return activeValue as T;
}

function disabledFieldDeletes(): Record<string, FieldValue> {
  return {
    disabledAt: FieldValue.delete(),
    disabledBy: FieldValue.delete(),
    disabledReason: FieldValue.delete()
  };
}
