import { randomUUID } from "node:crypto";
import { HttpError } from "../http/errors.js";
import type { KeyAvailabilityService } from "./key-availability.service.js";
import type { KeyCatalogStore } from "./key-catalog.store.js";
import type {
  KeyMovementListQuery,
  KeyMovementRecord,
  KeyMovementStore
} from "./key-movement.store.js";
import type { KeyCatalog, PhysicalKey, Room } from "./types.js";

export interface RegisterKeyWithdrawalInput {
  readonly keyId: string;
  readonly roomId: string;
  readonly responsibleName: string;
  readonly responsibleIdentifier?: string;
  readonly actorName: string;
  readonly actorIdentifier?: string;
  readonly occurredAt?: string;
  readonly notes?: string;
}

export interface RegisterKeyReturnInput {
  readonly keyId: string;
  readonly actorName: string;
  readonly actorIdentifier?: string;
  readonly occurredAt?: string;
  readonly notes?: string;
}

export class KeyMovementService {
  constructor(
    private readonly keyCatalogStore: KeyCatalogStore,
    private readonly keyMovementStore: KeyMovementStore,
    private readonly keyAvailabilityService: KeyAvailabilityService
  ) {}

  async list(
    query: KeyMovementListQuery
  ): Promise<readonly KeyMovementRecord[]> {
    const records = await this.keyMovementStore.list(query);

    return records.filter(
      (record) => !query.status || record.status === query.status
    );
  }

  async registerWithdrawal(
    input: RegisterKeyWithdrawalInput
  ): Promise<KeyMovementRecord> {
    const occurredAt = parseOccurredAt(input.occurredAt);

    const catalog = await this.keyCatalogStore.getCatalog();
    const { key, room } = requireLinkedKeyRoom(
      catalog,
      input.keyId,
      input.roomId
    );
    const openMovement = await this.keyMovementStore.findOpenByKey(key.id);

    if (openMovement) {
      throw new HttpError(
        409,
        "key_already_checked_out",
        "Chave ja esta retirada."
      );
    }

    const availability = await this.keyAvailabilityService.listAvailability(
      new Date(occurredAt)
    );
    const keyAvailability = availability.find((item) => item.key.id === key.id);
    if (keyAvailability?.status !== "disponivel") {
      throw new HttpError(
        409,
        "key_not_available",
        "Chave indisponivel para retirada."
      );
    }

    const record = {
      id: `km-${occurredAt.replace(/[^0-9]/g, "")}-${randomUUID()}`,
      keyId: key.id,
      roomId: room.id,
      status: "retirada",
      origin: "portaria",
      responsibleName: input.responsibleName,
      responsibleIdentifier: input.responsibleIdentifier,
      checkedOutByName: input.actorName,
      checkedOutByIdentifier: input.actorIdentifier,
      checkedOutAt: occurredAt,
      notes: input.notes
    } satisfies KeyMovementRecord;

    await this.keyCatalogStore.updateKeyStatus({
      keyId: key.id,
      baseStatus: "retirada"
    });

    try {
      return await this.keyMovementStore.create({ record });
    } catch (error) {
      await this.keyCatalogStore.updateKeyStatus({
        keyId: key.id,
        baseStatus: key.baseStatus
      });
      throw error;
    }
  }

  async registerReturn(
    input: RegisterKeyReturnInput
  ): Promise<KeyMovementRecord> {
    const occurredAt = parseOccurredAt(input.occurredAt);
    const catalog = await this.keyCatalogStore.getCatalog();
    const key = requireKey(catalog, input.keyId);
    const openMovement = await this.keyMovementStore.findOpenByKey(key.id);

    if (!openMovement) {
      throw new HttpError(
        404,
        "open_key_movement_not_found",
        "Nao ha retirada aberta para esta chave."
      );
    }

    const updated = await this.keyMovementStore.close({
      id: openMovement.id,
      returnedByName: input.actorName,
      returnedByIdentifier: input.actorIdentifier,
      returnedAt: occurredAt,
      returnNotes: input.notes
    });

    await this.keyCatalogStore.updateKeyStatus({
      keyId: key.id,
      baseStatus: "disponivel"
    });

    return updated;
  }
}

function requireLinkedKeyRoom(
  catalog: KeyCatalog,
  keyId: string,
  roomId: string
): { key: PhysicalKey; room: Room } {
  const key = requireKey(catalog, keyId);
  const room = catalog.rooms.find((item) => item.id === roomId);

  if (key.disabledAt) {
    throw new HttpError(409, "key_disabled", "Chave desativada.");
  }

  if (!room) {
    throw new HttpError(404, "room_not_found", "Sala nao encontrada.");
  }

  if (room.disabledAt) {
    throw new HttpError(409, "room_disabled", "Sala desativada.");
  }

  if (
    !catalog.links.some(
      (link) =>
        link.keyId === key.id && link.roomId === room.id && !link.disabledAt
    )
  ) {
    throw new HttpError(
      409,
      "key_room_link_not_found",
      "Chave nao esta vinculada a sala informada."
    );
  }

  return { key, room };
}

function requireKey(catalog: KeyCatalog, keyId: string): PhysicalKey {
  const key = catalog.keys.find((item) => item.id === keyId);

  if (!key) {
    throw new HttpError(404, "key_not_found", "Chave nao encontrada.");
  }

  return key;
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
      "Data da movimentacao deve ser uma data ISO valida."
    );
  }

  return parsed.toISOString();
}
