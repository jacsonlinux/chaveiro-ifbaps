import { randomUUID } from "node:crypto";
import { HttpError } from "../http/errors.js";
import type { KeyCatalogStore } from "./key-catalog.store.js";
import type { KeyMovementStore } from "./key-movement.store.js";
import type {
  KeyOccurrenceListQuery,
  KeyOccurrenceOrigin,
  KeyOccurrenceRecord,
  KeyOccurrenceStore,
  KeyOccurrenceType
} from "./key-occurrence.store.js";
import type { KeyCatalog, KeyOperationalStatus, PhysicalKey } from "./types.js";

export interface RegisterKeyOccurrenceInput {
  readonly keyId: string;
  readonly roomId?: string;
  readonly type: KeyOccurrenceType;
  readonly origin: KeyOccurrenceOrigin;
  readonly targetStatus?: KeyOperationalStatus;
  readonly actorName: string;
  readonly actorIdentifier?: string;
  readonly occurredAt?: string;
  readonly notes: string;
}

export class KeyOccurrenceService {
  constructor(
    private readonly keyCatalogStore: KeyCatalogStore,
    private readonly keyMovementStore: KeyMovementStore,
    private readonly keyOccurrenceStore: KeyOccurrenceStore
  ) {}

  async list(
    query: KeyOccurrenceListQuery
  ): Promise<readonly KeyOccurrenceRecord[]> {
    return this.keyOccurrenceStore.list(query);
  }

  async registerOccurrence(
    input: RegisterKeyOccurrenceInput
  ): Promise<KeyOccurrenceRecord> {
    const occurredAt = parseOccurredAt(input.occurredAt);
    const catalog = await this.keyCatalogStore.getCatalog();
    const key = requireKey(catalog, input.keyId);

    if (input.roomId) {
      requireLinkedRoom(catalog, key.id, input.roomId);
    }

    if (input.targetStatus === "bloqueada_por_reserva") {
      throw new HttpError(
        400,
        "manual_reservation_block_not_allowed",
        "Bloqueio por reserva e calculado pelo backend."
      );
    }

    if (input.targetStatus === "disponivel") {
      const openMovement = await this.keyMovementStore.findOpenByKey(key.id);
      if (openMovement) {
        throw new HttpError(
          409,
          "key_has_open_movement",
          "Chave com retirada aberta nao pode ser liberada por ocorrencia."
        );
      }
    }

    const record = {
      id: `ko-${occurredAt.replace(/[^0-9]/g, "")}-${randomUUID()}`,
      keyId: key.id,
      roomId: input.roomId,
      type: input.type,
      origin: input.origin,
      previousStatus: key.baseStatus,
      targetStatus: input.targetStatus,
      actorName: input.actorName,
      actorIdentifier: input.actorIdentifier,
      occurredAt,
      notes: input.notes
    } satisfies KeyOccurrenceRecord;

    if (!input.targetStatus) {
      return this.keyOccurrenceStore.create({ record });
    }

    await this.keyCatalogStore.updateKeyStatus({
      keyId: key.id,
      baseStatus: input.targetStatus
    });

    try {
      return await this.keyOccurrenceStore.create({ record });
    } catch (error) {
      await this.keyCatalogStore.updateKeyStatus({
        keyId: key.id,
        baseStatus: key.baseStatus
      });
      throw error;
    }
  }
}

function requireKey(catalog: KeyCatalog, keyId: string): PhysicalKey {
  const key = catalog.keys.find((item) => item.id === keyId);

  if (!key) {
    throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
  }

  return key;
}

function requireLinkedRoom(
  catalog: KeyCatalog,
  keyId: string,
  roomId: string
): void {
  const room = catalog.rooms.find((item) => item.id === roomId);
  if (!room) {
    throw new HttpError(404, "room_not_found", "Sala nao encontrada.");
  }

  if (!catalog.links.some((link) => link.keyId === keyId && link.roomId === room.id)) {
    throw new HttpError(
      409,
      "key_room_link_not_found",
      "Chave nao esta vinculada a sala informada."
    );
  }
}

function parseOccurredAt(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(
      400,
      "invalid_date",
      "Data da ocorrencia deve ser uma data ISO valida."
    );
  }

  return parsed.toISOString();
}
