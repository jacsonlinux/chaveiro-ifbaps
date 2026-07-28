import type { UserRole } from "../auth/types.js";

export interface AppUser {
  readonly id: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly campus?: string;
  readonly roles: readonly UserRole[];
  readonly source: "suap" | "firebase";
  readonly firstSeenAt: string;
  readonly lastLoginAt: string;
  readonly updatedAt: string;
  readonly rolesUpdatedAt?: string;
  readonly rolesUpdatedBy?: string;
}

export interface UpsertAuthenticatedUserInput {
  readonly id: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly campus?: string;
  readonly roles: readonly UserRole[];
  readonly source: "suap" | "firebase";
  readonly loggedInAt: string;
}

export interface UpdateUserRolesInput {
  readonly id: string;
  readonly roles: readonly UserRole[];
  readonly updatedAt: string;
  readonly updatedBy?: string;
}

export interface UserListQuery {
  readonly search?: string;
  readonly role?: UserRole;
}

export interface UserStore {
  readonly name: "memory" | "firestore";
  upsertAuthenticatedUser(
    input: UpsertAuthenticatedUserInput,
  ): Promise<AppUser>;
  listUsers(query?: UserListQuery): Promise<readonly AppUser[]>;
  updateUserRoles(input: UpdateUserRolesInput): Promise<AppUser>;
}

export function applyUserListQuery(
  users: Iterable<AppUser>,
  query: UserListQuery = {},
): readonly AppUser[] {
  const search = query.search ? normalizeSearch(query.search) : "";

  return [...users]
    .filter((user) => !query.role || user.roles.includes(query.role))
    .filter((user) => !search || userMatchesSearch(user, search))
    .sort((left, right) =>
      (left.displayName ?? left.id).localeCompare(right.displayName ?? right.id),
    );
}

function userMatchesSearch(user: AppUser, search: string): boolean {
  return normalizeSearch(
    [user.id, user.displayName, user.email, user.campus]
      .filter(Boolean)
      .join(" "),
  ).includes(search);
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
