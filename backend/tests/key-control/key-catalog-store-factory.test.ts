import { describe, expect, it } from "vitest";
import { createKeyCatalogStore } from "../../src/key-control/key-catalog-store-factory.js";
import { MemoryKeyCatalogStore } from "../../src/key-control/memory-key-catalog.store.js";
import { createTestAppConfig } from "../helpers/app-config.js";

describe("createKeyCatalogStore", () => {
  it("uses the in-memory key catalog store by default", () => {
    const store = createKeyCatalogStore(createTestAppConfig());

    expect(store).toBeInstanceOf(MemoryKeyCatalogStore);
    expect(store.name).toBe("memory");
  });
});
