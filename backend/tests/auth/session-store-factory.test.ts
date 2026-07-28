import { describe, expect, it } from "vitest";
import { createAuthSessionStore } from "../../src/auth/session-store-factory.js";
import { MemoryAuthSessionStore } from "../../src/auth/session-store.js";
import { createTestAppConfig } from "../helpers/app-config.js";

describe("createAuthSessionStore", () => {
  it("uses the in-memory auth session store by default", () => {
    const store = createAuthSessionStore(createTestAppConfig());

    expect(store).toBeInstanceOf(MemoryAuthSessionStore);
    expect(store.name).toBe("memory");
  });
});
