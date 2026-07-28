import { describe, expect, it } from "vitest";
import { createKeyMovementStore } from "../../src/key-control/key-movement-store-factory.js";
import { MemoryKeyMovementStore } from "../../src/key-control/memory-key-movement.store.js";
import { createTestAppConfig } from "../helpers/app-config.js";

describe("createKeyMovementStore", () => {
  it("uses the in-memory key movement store by default", () => {
    const store = createKeyMovementStore(createTestAppConfig());

    expect(store).toBeInstanceOf(MemoryKeyMovementStore);
    expect(store.name).toBe("memory");
  });
});
