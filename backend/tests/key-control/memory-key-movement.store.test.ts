import { describe, expect, it } from "vitest";
import { MemoryKeyMovementStore } from "../../src/key-control/memory-key-movement.store.js";
import type { KeyMovementRecord } from "../../src/key-control/key-movement.store.js";

describe("MemoryKeyMovementStore", () => {
  it("stores, filters and closes movement records", async () => {
    const store = new MemoryKeyMovementStore();
    const record = createRecord();

    await store.create({ record });

    await expect(store.findOpenByKey("key-a06")).resolves.toMatchObject({
      id: "movement-1",
      status: "retirada"
    });
    await expect(store.list({ status: "retirada" })).resolves.toHaveLength(1);

    const closed = await store.close({
      id: "movement-1",
      returnedByName: "Portaria",
      returnedAt: "2026-07-28T13:00:00.000Z"
    });

    expect(closed).toMatchObject({
      id: "movement-1",
      status: "devolvida",
      returnedByName: "Portaria"
    });
    await expect(store.findOpenByKey("key-a06")).resolves.toBeUndefined();
    await expect(
      store.list({
        dateField: "returnedAt",
        from: "2026-07-28T12:30:00.000Z",
        to: "2026-07-28T13:30:00.000Z"
      })
    ).resolves.toMatchObject([{ id: "movement-1" }]);
  });
});

function createRecord(): KeyMovementRecord {
  return {
    id: "movement-1",
    keyId: "key-a06",
    roomId: "a06",
    status: "retirada",
    origin: "portaria",
    responsibleName: "Pessoa Responsavel",
    checkedOutByName: "Portaria",
    checkedOutAt: "2026-07-28T11:00:00.000Z"
  };
}
