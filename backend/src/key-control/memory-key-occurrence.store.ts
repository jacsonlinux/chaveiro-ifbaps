import { HttpError } from "../http/errors.js";
import {
  applyKeyOccurrenceQuery,
  type CreateKeyOccurrenceRecordInput,
  type KeyOccurrenceListQuery,
  type KeyOccurrenceRecord,
  type KeyOccurrenceStore
} from "./key-occurrence.store.js";

export class MemoryKeyOccurrenceStore implements KeyOccurrenceStore {
  readonly name = "memory";
  private readonly records = new Map<string, KeyOccurrenceRecord>();

  async list(
    query: KeyOccurrenceListQuery
  ): Promise<readonly KeyOccurrenceRecord[]> {
    return applyKeyOccurrenceQuery(this.records.values(), query);
  }

  async create(
    input: CreateKeyOccurrenceRecordInput
  ): Promise<KeyOccurrenceRecord> {
    if (this.records.has(input.record.id)) {
      throw new HttpError(
        409,
        "key_occurrence_already_exists",
        "Ocorrencia ja registrada."
      );
    }

    this.records.set(input.record.id, input.record);
    return input.record;
  }
}
