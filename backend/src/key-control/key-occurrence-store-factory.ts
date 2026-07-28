import type { AppConfig } from "../config/env.js";
import { FirestoreKeyOccurrenceStore } from "./firestore-key-occurrence.store.js";
import type { KeyOccurrenceStore } from "./key-occurrence.store.js";
import { MemoryKeyOccurrenceStore } from "./memory-key-occurrence.store.js";

export function createKeyOccurrenceStore(
  config: AppConfig
): KeyOccurrenceStore {
  if (config.keyOccurrenceStore.name === "firestore") {
    return new FirestoreKeyOccurrenceStore(config);
  }

  return new MemoryKeyOccurrenceStore();
}
