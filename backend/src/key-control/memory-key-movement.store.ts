import { HttpError } from "../http/errors.js";
import {
  applyKeyMovementQuery,
  type CloseKeyMovementRecordInput,
  type CreateKeyMovementRecordInput,
  type KeyMovementListQuery,
  type KeyMovementRecord,
  type KeyMovementStore
} from "./key-movement.store.js";

export class MemoryKeyMovementStore implements KeyMovementStore {
  readonly name = "memory";
  private readonly records = new Map<string, KeyMovementRecord>();

  async list(
    query: KeyMovementListQuery
  ): Promise<readonly KeyMovementRecord[]> {
    return applyKeyMovementQuery(this.records.values(), query);
  }

  async findOpenByKey(keyId: string): Promise<KeyMovementRecord | undefined> {
    return [...this.records.values()].find(
      (record) => record.keyId === keyId && record.status === "retirada"
    );
  }

  async create(
    input: CreateKeyMovementRecordInput
  ): Promise<KeyMovementRecord> {
    if (this.records.has(input.record.id)) {
      throw new HttpError(
        409,
        "key_movement_already_exists",
        "Movimentacao ja registrada."
      );
    }

    this.records.set(input.record.id, input.record);
    return input.record;
  }

  async close(
    input: CloseKeyMovementRecordInput
  ): Promise<KeyMovementRecord> {
    const record = this.records.get(input.id);

    if (!record) {
      throw new HttpError(
        404,
        "key_movement_not_found",
        "Movimentacao nao encontrada."
      );
    }

    if (record.status !== "retirada") {
      throw new HttpError(
        409,
        "key_movement_already_returned",
        "Chave ja devolvida."
      );
    }

    const updated = {
      ...record,
      status: "devolvida",
      returnedByName: input.returnedByName,
      returnedByIdentifier: input.returnedByIdentifier,
      returnedAt: input.returnedAt,
      returnNotes: input.returnNotes
    } satisfies KeyMovementRecord;

    this.records.set(input.id, updated);
    return updated;
  }
}
