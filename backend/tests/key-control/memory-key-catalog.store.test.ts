import { describe, expect, it } from "vitest";
import { HttpError } from "../../src/http/errors.js";
import { MemoryKeyCatalogStore } from "../../src/key-control/memory-key-catalog.store.js";

describe("MemoryKeyCatalogStore", () => {
  it("creates rooms, keys and links for the local key catalog", async () => {
    const store = new MemoryKeyCatalogStore();

    const room = await store.createRoom({
      name: "A06 - SALA DE AULA - Bloco A (PS)",
      campus: "PS",
      externalRefs: ["A06"]
    });
    const key = await store.createKey({
      code: "CH-A06",
      label: "Chave A06"
    });
    const link = await store.createLink({
      keyId: key.id,
      roomId: room.id
    });

    await expect(store.getCatalog()).resolves.toMatchObject({
      rooms: [
        {
          id: "a06-sala-de-aula-bloco-a-ps",
          name: "A06 - SALA DE AULA - Bloco A (PS)",
          externalRefs: ["A06", "A06 - SALA DE AULA - Bloco A (PS)"]
        }
      ],
      keys: [
        {
          id: "ch-a06",
          code: "CH-A06",
          label: "Chave A06",
          baseStatus: "disponivel"
        }
      ],
      links: [link]
    });
  });

  it("rejects duplicate rooms and missing references", async () => {
    const store = new MemoryKeyCatalogStore();

    await store.createRoom({ id: "a06", name: "A06" });

    await expect(store.createRoom({ id: "a06", name: "A06" })).rejects.toBeInstanceOf(
      HttpError
    );
    await expect(
      store.createLink({ keyId: "nao-existe", roomId: "a06" })
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "key_not_found"
    });
  });

  it("lists rooms and keys by natural code order", async () => {
    const store = new MemoryKeyCatalogStore();

    await store.createRoom({ id: "a10", name: "A10 - Sala" });
    await store.createRoom({ id: "a02", name: "A02 - Sala" });
    await store.createRoom({ id: "b01", name: "B01 - Sala" });
    await store.createKey({ code: "A10" });
    await store.createKey({ code: "A02" });
    await store.createKey({ code: "B01" });

    await expect(store.listRooms()).resolves.toMatchObject([
      { id: "a02" },
      { id: "a10" },
      { id: "b01" }
    ]);
    await expect(store.listKeys()).resolves.toMatchObject([
      { code: "A02" },
      { code: "A10" },
      { code: "B01" }
    ]);
  });
});
