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
      loggedInAt: "2026-07-28T10:00:00.000Z"
    });

    const updated = await store.upsertAuthenticatedUser({
      id: "0000001",
      displayName: "Usuario Teste Atualizado",
      email: "usuario.teste@ifba.edu.br",
      campus: "PS",
      roles: ["usuario", "admin"],
      source: "suap",
      loggedInAt: "2026-07-28T11:00:00.000Z"
    });

    expect(updated).toMatchObject({
      id: "0000001",
      displayName: "Usuario Teste Atualizado",
      roles: ["usuario", "admin"],
      firstSeenAt: "2026-07-28T10:00:00.000Z",
      lastLoginAt: "2026-07-28T11:00:00.000Z"
    });
    await expect(store.listUsers()).resolves.toHaveLength(1);
  });
});
