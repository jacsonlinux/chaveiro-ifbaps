export type KeyMovementStatus = "retirada" | "devolvida" | "atrasada";
export type KeyMovementOrigin = "portaria";
export type KeyMovementDateField = "checkedOutAt" | "returnedAt";

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
  readonly expectedReturnAt?: string;
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
  readonly dateField?: KeyMovementDateField;
  readonly from?: string;
  readonly to?: string;
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
  const dateField = query.dateField ?? "checkedOutAt";

  return [...records]
    .filter((record) => !query.keyId || record.keyId === query.keyId)
    .filter((record) => !query.roomId || record.roomId === query.roomId)
    .filter((record) => !query.status || record.status === query.status)
    .filter((record) => dateFieldInRange(record, dateField, query))
    .sort((left, right) =>
      getMovementDate(right, dateField).localeCompare(
        getMovementDate(left, dateField)
      )
    );
}

function dateFieldInRange(
  record: KeyMovementRecord,
  dateField: KeyMovementDateField,
  query: KeyMovementListQuery
): boolean {
  const value = getMovementDate(record, dateField);

  if (!value) {
    return !query.from && !query.to;
  }

  return (!query.from || value >= query.from) && (!query.to || value <= query.to);
}

function getMovementDate(
  record: KeyMovementRecord,
  dateField: KeyMovementDateField
): string {
  return dateField === "returnedAt" ? record.returnedAt ?? "" : record.checkedOutAt;
}
