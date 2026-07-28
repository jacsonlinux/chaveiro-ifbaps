import type {
  AppUser,
  UpsertAuthenticatedUserInput,
  UserStore
} from "./user.store.js";

export class MemoryUserStore implements UserStore {
  readonly name = "memory";
  private readonly users = new Map<string, AppUser>();

  async upsertAuthenticatedUser(
    input: UpsertAuthenticatedUserInput
  ): Promise<AppUser> {
    const existing = this.users.get(input.id);
    const user = {
      id: input.id,
      displayName: input.displayName,
      email: input.email,
      campus: input.campus,
      roles: [...input.roles],
      source: input.source,
      firstSeenAt: existing?.firstSeenAt ?? input.loggedInAt,
      lastLoginAt: input.loggedInAt,
      updatedAt: input.loggedInAt
    } satisfies AppUser;

    this.users.set(user.id, user);
    return user;
  }

  async listUsers(): Promise<readonly AppUser[]> {
    return [...this.users.values()].sort((left, right) =>
      (left.displayName ?? left.id).localeCompare(right.displayName ?? right.id)
    );
  }
}
