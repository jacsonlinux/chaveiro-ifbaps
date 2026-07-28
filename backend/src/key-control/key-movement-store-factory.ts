import type { AppConfig } from "../config/env.js";
import { FirestoreKeyMovementStore } from "./firestore-key-movement.store.js";
import type { KeyMovementStore } from "./key-movement.store.js";
import { MemoryKeyMovementStore } from "./memory-key-movement.store.js";

export function createKeyMovementStore(config: AppConfig): KeyMovementStore {
  if (config.keyMovementStore.name === "firestore") {
    return new FirestoreKeyMovementStore(config);
  }

  return new MemoryKeyMovementStore();
}
