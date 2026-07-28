export type KeyMovementStatus = "retirada" | "devolvida";
export type KeyMovementOrigin = "portaria";

export interface KeyMovementRecord {
  readonly id: string;
  readonly keyId: string;
  readonly roomId: string;
  readonly status: KeyMovementStatus;
  readonly origin: KeyMovementOrigin;
  readonly responsibleName: string;
  readonly responsibleIdentifier?: string;
  readonly checkedOutByName: string;
  readonly checkedOutByIdentifier?: string;
  readonly checkedOutAt: string;
  readonly returnedByName?: string;
  readonly returnedByIdentifier?: string;
  readonly returnedAt?: string;
  readonly notes?: string;
  readonly returnNotes?: string;
}

export interface CreateKeyMovementRecordInput {
  readonly record: KeyMovementRecord;
}

export interface CloseKeyMovementRecordInput {
  readonly id: string;
  readonly returnedByName: string;
  readonly returnedByIdentifier?: string;
  readonly returnedAt: string;
  readonly returnNotes?: string;
}

export interface KeyMovementListQuery {
  readonly keyId?: string;
  readonly roomId?: string;
  readonly status?: KeyMovementStatus;
}

export interface KeyMovementStore {
  readonly name: string;
  list(query: KeyMovementListQuery): Promise<readonly KeyMovementRecord[]>;
  findOpenByKey(keyId: string): Promise<KeyMovementRecord | undefined>;
  create(input: CreateKeyMovementRecordInput): Promise<KeyMovementRecord>;
  close(input: CloseKeyMovementRecordInput): Promise<KeyMovementRecord>;
}

export function applyKeyMovementQuery(
  records: Iterable<KeyMovementRecord>,
  query: KeyMovementListQuery
): readonly KeyMovementRecord[] {
  return [...records]
    .filter((record) => !query.keyId || record.keyId === query.keyId)
    .filter((record) => !query.roomId || record.roomId === query.roomId)
    .filter((record) => !query.status || record.status === query.status)
    .sort((left, right) => right.checkedOutAt.localeCompare(left.checkedOutAt));
}
