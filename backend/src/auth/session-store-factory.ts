import type { AppConfig } from "../config/env.js";
import { FirestoreAuthSessionStore } from "./firestore-session.store.js";
import {
  MemoryAuthSessionStore,
  type AuthSessionStore,
} from "./session-store.js";

export function createAuthSessionStore(config: AppConfig): AuthSessionStore {
  if (config.authSessionStore.name === "firestore") {
    return new FirestoreAuthSessionStore(config);
  }

  return new MemoryAuthSessionStore();
}
