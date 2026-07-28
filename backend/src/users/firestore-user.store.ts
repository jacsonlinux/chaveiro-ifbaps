import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  type CollectionReference,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";
import type { UserRole } from "../auth/types.js";
import type {
  AppUser,
  UserListQuery,
  UpdateUserRolesInput,
  UpsertAuthenticatedUserInput,
  UserStore,
} from "./user.store.js";
import { applyUserListQuery } from "./user.store.js";

export class FirestoreUserStore implements UserStore {
  readonly name = "firestore";
  private readonly db: Firestore;
  private readonly users: CollectionReference<DocumentData>;

  constructor(private readonly config: AppConfig) {
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
    this.users = this.db.collection(config.userStore.usersCollection);
  }

  async upsertAuthenticatedUser(
    input: UpsertAuthenticatedUserInput,
  ): Promise<AppUser> {
    const ref = this.users.doc(encodeURIComponent(input.id));
    const snapshot = await ref.get();
    const existing = snapshot.exists ? (snapshot.data() as AppUser) : undefined;
    const user = {
      id: input.id,
      displayName: input.displayName,
      email: input.email,
      campus: input.campus,
      roles: mergeRoles(existing?.roles, input.roles),
      source: input.source,
      firstSeenAt: existing?.firstSeenAt ?? input.loggedInAt,
      lastLoginAt: input.loggedInAt,
      updatedAt: input.loggedInAt,
      rolesUpdatedAt: existing?.rolesUpdatedAt,
      rolesUpdatedBy: existing?.rolesUpdatedBy,
    } satisfies AppUser;

    await ref.set(stripUndefined(user), { merge: true });
    return user;
  }

  async listUsers(query?: UserListQuery): Promise<readonly AppUser[]> {
    const snapshot = await this.users.get();
    return applyUserListQuery(
      snapshot.docs.map((doc) => doc.data() as AppUser),
      query,
    );
  }

  async updateUserRoles(input: UpdateUserRolesInput): Promise<AppUser> {
    const ref = this.users.doc(encodeURIComponent(input.id));
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw new HttpError(404, "user_not_found", "Usuario nao encontrado.");
    }

    const existing = snapshot.data() as AppUser;
    const updated = {
      ...existing,
      roles: [...input.roles],
      rolesUpdatedAt: input.updatedAt,
      rolesUpdatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    } satisfies AppUser;

    await ref.set(stripUndefined(updated), { merge: true });
    return updated;
  }
}

function mergeRoles(
  existing: readonly UserRole[] | undefined,
  next: readonly UserRole[],
): readonly UserRole[] {
  return [...new Set([...(existing ?? []), ...next])].filter(isUserRole);
}

function isUserRole(value: string): value is UserRole {
  return value === "usuario" || value === "portaria" || value === "admin";
}

function stripUndefined(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  );
}
