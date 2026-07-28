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

  it("deletes all expired sessions without touching active sessions", async () => {
    const store = new MemoryAuthSessionStore();
    const expired = await store.create({
      userId: "0000001",
      roles: ["usuario"],
      ttlMs: -1_000,
    });
    const active = await store.create({
      userId: "0000002",
      roles: ["usuario", "admin"],
      ttlMs: 60_000,
    });

    await expect(store.deleteExpired()).resolves.toBe(1);
    await expect(store.get(expired.id)).resolves.toBeUndefined();
    await expect(store.get(active.id)).resolves.toMatchObject({
      userId: "0000002",
    });
  });
});
