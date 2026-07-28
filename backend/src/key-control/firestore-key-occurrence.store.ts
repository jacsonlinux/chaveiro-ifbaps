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
  applyKeyOccurrenceQuery,
  type CreateKeyOccurrenceRecordInput,
  type KeyOccurrenceListQuery,
  type KeyOccurrenceRecord,
  type KeyOccurrenceStore
} from "./key-occurrence.store.js";

export class FirestoreKeyOccurrenceStore implements KeyOccurrenceStore {
  readonly name = "firestore";
  private readonly db: Firestore;
  private readonly occurrences: CollectionReference<DocumentData>;

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
    this.occurrences = this.db.collection(
      config.keyOccurrenceStore.occurrencesCollection
    );
  }

  async list(
    query: KeyOccurrenceListQuery
  ): Promise<readonly KeyOccurrenceRecord[]> {
    const snapshot = await this.occurrences.get();
    const records = snapshot.docs.map(
      (doc) => doc.data() as KeyOccurrenceRecord
    );

    return applyKeyOccurrenceQuery(records, query);
  }

  async create(
    input: CreateKeyOccurrenceRecordInput
  ): Promise<KeyOccurrenceRecord> {
    const ref = this.occurrences.doc(input.record.id);
    const snapshot = await ref.get();

    if (snapshot.exists) {
      throw new HttpError(
        409,
        "key_occurrence_already_exists",
        "Ocorrencia ja registrada."
      );
    }

    await ref.set(stripUndefined(input.record));
    return input.record;
  }
}

function stripUndefined(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined)
  );
}
