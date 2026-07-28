import type { AppConfig } from "../config/env.js";
import { FirestoreUserStore } from "./firestore-user.store.js";
import { MemoryUserStore } from "./memory-user.store.js";
import type { UserStore } from "./user.store.js";

export function createUserStore(config: AppConfig): UserStore {
  if (config.userStore.name === "firestore") {
    return new FirestoreUserStore(config);
  }

  return new MemoryUserStore();
}
