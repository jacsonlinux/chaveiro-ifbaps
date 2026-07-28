import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
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
  KeyCatalogStore
} from "./key-catalog.store.js";
import {
  normalizeCatalogId,
  optionalString,
  requireNonEmpty,
  uniqueRefs
} from "./key-catalog-validation.js";
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
      .sort((left, right) => left.name.localeCompare(right.name));
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

  async listKeys(): Promise<readonly PhysicalKey[]> {
    const snapshot = await this.keys.get();
    return snapshot.docs
      .map((doc) => doc.data() as PhysicalKey)
      .sort((left, right) => left.code.localeCompare(right.code));
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
