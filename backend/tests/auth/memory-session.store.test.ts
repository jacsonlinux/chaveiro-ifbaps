import { describe, expect, it } from "vitest";
import { MemoryAuthSessionStore } from "../../src/auth/session-store.js";

describe("MemoryAuthSessionStore", () => {
  it("creates, reads, expires and deletes auth sessions", async () => {
    const store = new MemoryAuthSessionStore();
    const session = await store.create({
      userId: "0000001",
      displayName: "Usuario Teste",
      email: "usuario.teste@ifba.edu.br",
      campus: "PS",
      roles: ["usuario", "admin"],
      ttlMs: 60_000,
    });

    await expect(store.get(session.id)).resolves.toMatchObject({
      userId: "0000001",
      roles: ["usuario", "admin"],
    });

    await expect(
      store.get(session.id, new Date(Date.now() + 120_000)),
    ).resolves.toBeUndefined();
    await expect(store.get(session.id)).resolves.toBeUndefined();

    const next = await store.create({
      userId: "0000002",
      roles: ["usuario"],
      ttlMs: 60_000,
    });
    await store.delete(next.id);
    await expect(store.get(next.id)).resolves.toBeUndefined();
  });
});
