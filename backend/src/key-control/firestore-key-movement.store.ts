import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  type CollectionReference,
  type DocumentData,
  type Firestore
} from "firebase-admin/firestore";
import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";
import {
  applyKeyMovementQuery,
  type CloseKeyMovementRecordInput,
  type CreateKeyMovementRecordInput,
  type KeyMovementListQuery,
  type KeyMovementRecord,
  type KeyMovementStore
} from "./key-movement.store.js";

export class FirestoreKeyMovementStore implements KeyMovementStore {
  readonly name = "firestore";
  private readonly db: Firestore;
  private readonly movements: CollectionReference<DocumentData>;

  constructor(config: AppConfig) {
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
    this.movements = this.db.collection(
      config.keyMovementStore.movementsCollection
    );
  }

  async list(
    query: KeyMovementListQuery
  ): Promise<readonly KeyMovementRecord[]> {
    const snapshot = await this.movements.get();
    const records = snapshot.docs.map((doc) => doc.data() as KeyMovementRecord);

    return applyKeyMovementQuery(records, query);
  }

  async findOpenByKey(keyId: string): Promise<KeyMovementRecord | undefined> {
    const snapshot = await this.movements
      .where("keyId", "==", keyId)
      .where("status", "==", "retirada")
      .limit(1)
      .get();

    return snapshot.docs[0]?.data() as KeyMovementRecord | undefined;
  }

  async create(
    input: CreateKeyMovementRecordInput
  ): Promise<KeyMovementRecord> {
    const ref = this.movements.doc(input.record.id);
    const snapshot = await ref.get();

    if (snapshot.exists) {
      throw new HttpError(
        409,
        "key_movement_already_exists",
        "Movimentacao ja registrada."
      );
    }

    await ref.set(stripUndefined(input.record));
    return input.record;
  }

  async close(
    input: CloseKeyMovementRecordInput
  ): Promise<KeyMovementRecord> {
    const ref = this.movements.doc(input.id);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw new HttpError(
        404,
        "key_movement_not_found",
        "Movimentacao nao encontrada."
      );
    }

    const record = snapshot.data() as KeyMovementRecord;
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

    await ref.set(stripUndefined(updated), { merge: true });
    return updated;
  }
}

function stripUndefined(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined)
  );
}
