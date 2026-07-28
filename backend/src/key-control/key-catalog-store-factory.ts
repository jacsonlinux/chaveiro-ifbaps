import type { AppConfig } from "../config/env.js";
import { FirestoreKeyCatalogStore } from "./firestore-key-catalog.store.js";
import type { KeyCatalogStore } from "./key-catalog.store.js";
import { MemoryKeyCatalogStore } from "./memory-key-catalog.store.js";

export function createKeyCatalogStore(config: AppConfig): KeyCatalogStore {
  if (config.keyCatalogStore.name === "firestore") {
    return new FirestoreKeyCatalogStore(config);
  }

  return new MemoryKeyCatalogStore();
}
