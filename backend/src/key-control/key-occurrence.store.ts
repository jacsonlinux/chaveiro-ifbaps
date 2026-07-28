import type { KeyOperationalStatus } from "./types.js";

export type KeyOccurrenceType = "ocorrencia" | "ajuste_admin";
export type KeyOccurrenceOrigin = "portaria" | "admin";

export interface KeyOccurrenceRecord {
  readonly id: string;
  readonly keyId: string;
  readonly roomId?: string;
  readonly type: KeyOccurrenceType;
  readonly origin: KeyOccurrenceOrigin;
  readonly previousStatus: KeyOperationalStatus;
  readonly targetStatus?: KeyOperationalStatus;
  readonly actorName: string;
  readonly actorIdentifier?: string;
  readonly occurredAt: string;
  readonly notes: string;
}

export interface CreateKeyOccurrenceRecordInput {
  readonly record: KeyOccurrenceRecord;
}

export interface KeyOccurrenceListQuery {
  readonly keyId?: string;
  readonly roomId?: string;
  readonly type?: KeyOccurrenceType;
  readonly from?: string;
  readonly to?: string;
}

export interface KeyOccurrenceStore {
  readonly name: string;
  list(query: KeyOccurrenceListQuery): Promise<readonly KeyOccurrenceRecord[]>;
  create(input: CreateKeyOccurrenceRecordInput): Promise<KeyOccurrenceRecord>;
}

export function applyKeyOccurrenceQuery(
  records: Iterable<KeyOccurrenceRecord>,
  query: KeyOccurrenceListQuery
): readonly KeyOccurrenceRecord[] {
  return [...records]
    .filter((record) => !query.keyId || record.keyId === query.keyId)
    .filter((record) => !query.roomId || record.roomId === query.roomId)
    .filter((record) => !query.type || record.type === query.type)
    .filter((record) => !query.from || record.occurredAt >= query.from)
    .filter((record) => !query.to || record.occurredAt <= query.to)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}
