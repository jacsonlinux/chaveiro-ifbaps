import type { UserRole } from "../auth/types.js";

export interface AppUser {
  readonly id: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly campus?: string;
  readonly roles: readonly UserRole[];
  readonly source: "suap";
  readonly firstSeenAt: string;
  readonly lastLoginAt: string;
  readonly updatedAt: string;
}

export interface UpsertAuthenticatedUserInput {
  readonly id: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly campus?: string;
  readonly roles: readonly UserRole[];
  readonly source: "suap";
  readonly loggedInAt: string;
}

export interface UserStore {
  readonly name: "memory" | "firestore";
  upsertAuthenticatedUser(input: UpsertAuthenticatedUserInput): Promise<AppUser>;
  listUsers(): Promise<readonly AppUser[]>;
}
