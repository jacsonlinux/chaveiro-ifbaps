import type { UserRole } from "../auth/types.js";
import { HttpError } from "../http/errors.js";
import type {
  AppUser,
  UpdateUserRolesInput,
  UpsertAuthenticatedUserInput,
  UserStore,
} from "./user.store.js";

export class MemoryUserStore implements UserStore {
  readonly name = "memory";
  private readonly users = new Map<string, AppUser>();

  async upsertAuthenticatedUser(
    input: UpsertAuthenticatedUserInput,
  ): Promise<AppUser> {
    const existing = this.users.get(input.id);
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

    this.users.set(user.id, user);
    return user;
  }

  async listUsers(): Promise<readonly AppUser[]> {
    return [...this.users.values()].sort((left, right) =>
      (left.displayName ?? left.id).localeCompare(
        right.displayName ?? right.id,
      ),
    );
  }

  async updateUserRoles(input: UpdateUserRolesInput): Promise<AppUser> {
    const existing = this.users.get(input.id);
    if (!existing) {
      throw new HttpError(404, "user_not_found", "Usuario nao encontrado.");
    }

    const updated = {
      ...existing,
      roles: [...input.roles],
      rolesUpdatedAt: input.updatedAt,
      rolesUpdatedBy: input.updatedBy,
      updatedAt: input.updatedAt,
    } satisfies AppUser;

    this.users.set(updated.id, updated);
    return updated;
  }
}

function mergeRoles(
  existing: readonly UserRole[] | undefined,
  next: readonly UserRole[],
): readonly UserRole[] {
  return [...new Set([...(existing ?? []), ...next])];
}
