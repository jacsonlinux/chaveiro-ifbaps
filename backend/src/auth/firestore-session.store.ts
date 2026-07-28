import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  type CollectionReference,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";
import type {
  AuthSession,
  AuthSessionStore,
  CreateAuthSessionInput,
} from "./session-store.js";
import { createAuthSessionRecord } from "./session-store.js";

export class FirestoreAuthSessionStore implements AuthSessionStore {
  readonly name = "firestore";
  private readonly db: Firestore;
  private readonly sessions: CollectionReference<DocumentData>;

  constructor(config: AppConfig) {
    const serviceAccountPath = config.firebaseRuntime.serviceAccountPath;
    if (!serviceAccountPath) {
      throw new HttpError(
        503,
        "firebase_service_account_not_configured",
        "Service account do Firebase nao configurada.",
      );
    }

    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert(serviceAccountPath),
      });
    this.db = getFirestore(app);
    this.sessions = this.db.collection(
      config.authSessionStore.sessionsCollection,
    );
  }

  async create(input: CreateAuthSessionInput): Promise<AuthSession> {
    const session = createAuthSessionRecord(input);
    await this.sessions.doc(session.id).set(stripUndefined(session));
    return session;
  }

  async get(
    sessionId: string,
    now = new Date(),
  ): Promise<AuthSession | undefined> {
    const ref = this.sessions.doc(sessionId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return undefined;
    }

    const session = snapshot.data() as AuthSession;
    if (new Date(session.expiresAt).getTime() <= now.getTime()) {
      await ref.delete();
      return undefined;
    }

    return session;
  }

  async delete(sessionId: string): Promise<void> {
    await this.sessions.doc(sessionId).delete();
  }
}

function stripUndefined(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  );
}
