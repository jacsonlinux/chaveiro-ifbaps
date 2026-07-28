import { describe, expect, it } from "vitest";
import { MemoryUserStore } from "../../src/users/memory-user.store.js";

describe("MemoryUserStore", () => {
  it("creates and updates authenticated SUAP users", async () => {
    const store = new MemoryUserStore();

    await store.upsertAuthenticatedUser({
      id: "0000001",
      displayName: "Usuario Teste",
      email: "usuario.teste@ifba.edu.br",
      campus: "PS",
      roles: ["usuario"],
      source: "suap",
      loggedInAt: "2026-07-28T10:00:00.000Z",
    });

    const updated = await store.upsertAuthenticatedUser({
      id: "0000001",
      displayName: "Usuario Teste Atualizado",
      email: "usuario.teste@ifba.edu.br",
      campus: "PS",
      roles: ["usuario", "admin"],
      source: "suap",
      loggedInAt: "2026-07-28T11:00:00.000Z",
    });

    expect(updated).toMatchObject({
      id: "0000001",
      displayName: "Usuario Teste Atualizado",
      roles: ["usuario", "admin"],
      firstSeenAt: "2026-07-28T10:00:00.000Z",
      lastLoginAt: "2026-07-28T11:00:00.000Z",
    });
    await expect(store.listUsers()).resolves.toHaveLength(1);
  });

  it("updates roles administratively and preserves them on later login", async () => {
    const store = new MemoryUserStore();

    await store.upsertAuthenticatedUser({
      id: "0000002",
      displayName: "Pessoa Portaria",
      email: "portaria@ifba.edu.br",
      campus: "PS",
      roles: ["usuario"],
      source: "suap",
      loggedInAt: "2026-07-28T10:00:00.000Z",
    });

    const updated = await store.updateUserRoles({
      id: "0000002",
      roles: ["usuario", "portaria"],
      updatedAt: "2026-07-28T10:30:00.000Z",
      updatedBy: "0000001",
    });

    expect(updated).toMatchObject({
      roles: ["usuario", "portaria"],
      rolesUpdatedAt: "2026-07-28T10:30:00.000Z",
      rolesUpdatedBy: "0000001",
    });

    const afterLogin = await store.upsertAuthenticatedUser({
      id: "0000002",
      displayName: "Pessoa Portaria",
      email: "portaria@ifba.edu.br",
      campus: "PS",
      roles: ["usuario"],
      source: "suap",
      loggedInAt: "2026-07-28T11:00:00.000Z",
    });

    expect(afterLogin.roles).toEqual(["usuario", "portaria"]);
  });

  it("filters users by search text and role", async () => {
    const store = new MemoryUserStore();

    await store.upsertAuthenticatedUser({
      id: "0000003",
      displayName: "Ana Portaria",
      email: "ana.portaria@ifba.edu.br",
      campus: "PS",
      roles: ["usuario", "portaria"],
      source: "suap",
      loggedInAt: "2026-07-28T10:00:00.000Z",
    });
    await store.upsertAuthenticatedUser({
      id: "0000004",
      displayName: "Bruno Admin",
      email: "bruno.admin@ifba.edu.br",
      campus: "SSA",
      roles: ["usuario", "admin"],
      source: "suap",
      loggedInAt: "2026-07-28T10:05:00.000Z",
    });

    await expect(
      store.listUsers({
        search: "portaria",
        role: "portaria",
      }),
    ).resolves.toMatchObject([
      {
        id: "0000003",
        displayName: "Ana Portaria",
      },
    ]);
    await expect(
      store.listUsers({
        search: "ssa",
        role: "portaria",
      }),
    ).resolves.toHaveLength(0);
  });
});
