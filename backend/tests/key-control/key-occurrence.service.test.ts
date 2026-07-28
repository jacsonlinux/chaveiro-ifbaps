import { describe, expect, it } from "vitest";
import { KeyOccurrenceService } from "../../src/key-control/key-occurrence.service.js";
import { MemoryKeyCatalogStore } from "../../src/key-control/memory-key-catalog.store.js";
import { MemoryKeyMovementStore } from "../../src/key-control/memory-key-movement.store.js";
import { MemoryKeyOccurrenceStore } from "../../src/key-control/memory-key-occurrence.store.js";

describe("KeyOccurrenceService", () => {
  it("records an occurrence and updates the key base status", async () => {
    const { catalog, service } = await createService();

    const occurrence = await service.registerOccurrence({
      keyId: "key-a06",
      roomId: "a06",
      type: "ocorrencia",
      origin: "portaria",
      targetStatus: "danificada",
      actorName: "Portaria",
      occurredAt: "2026-07-28T14:00:00.000-03:00",
      notes: "Chave emperrando na fechadura."
    });

    expect(occurrence).toMatchObject({
      keyId: "key-a06",
      roomId: "a06",
      type: "ocorrencia",
      previousStatus: "disponivel",
      targetStatus: "danificada",
      notes: "Chave emperrando na fechadura."
    });
    await expect(catalog.listKeys()).resolves.toMatchObject([
      {
        id: "key-a06",
        baseStatus: "danificada"
      }
    ]);
  });

  it("rejects manual reservation blocking", async () => {
    const { service } = await createService();

    await expect(
      service.registerOccurrence({
        keyId: "key-a06",
        type: "ajuste_admin",
        origin: "admin",
        targetStatus: "bloqueada_por_reserva",
        actorName: "Admin",
        notes: "Bloqueio manual indevido."
      })
    ).rejects.toMatchObject({
      code: "manual_reservation_block_not_allowed"
    });
  });

  it("does not release a key while a withdrawal is open", async () => {
    const { movementStore, service } = await createService();
    await movementStore.create({
      record: {
        id: "km-open",
        keyId: "key-a06",
        roomId: "a06",
        status: "retirada",
        origin: "portaria",
        responsibleName: "Pessoa Responsavel",
        checkedOutByName: "Portaria",
        checkedOutAt: "2026-07-28T14:00:00.000Z"
      }
    });

    await expect(
      service.registerOccurrence({
        keyId: "key-a06",
        type: "ajuste_admin",
        origin: "admin",
        targetStatus: "disponivel",
        actorName: "Admin",
        notes: "Tentativa de liberar com retirada aberta."
      })
    ).rejects.toMatchObject({
      code: "key_has_open_movement"
    });
  });

  it("filters occurrence history by occurrence period", async () => {
    const { service } = await createService();

    await service.registerOccurrence({
      keyId: "key-a06",
      type: "ocorrencia",
      origin: "portaria",
      actorName: "Portaria",
      occurredAt: "2026-07-28T08:00:00.000-03:00",
      notes: "Primeira ocorrencia."
    });
    const second = await service.registerOccurrence({
      keyId: "key-a06",
      type: "ocorrencia",
      origin: "portaria",
      actorName: "Portaria",
      occurredAt: "2026-07-29T08:00:00.000-03:00",
      notes: "Segunda ocorrencia."
    });

    const history = await service.list({
      from: "2026-07-29T00:00:00.000-03:00",
      to: "2026-07-29T23:59:59.999-03:00"
    });

    expect(history.map((record) => record.id)).toEqual([second.id]);
  });
});

async function createService() {
  const catalog = new MemoryKeyCatalogStore();
  const movementStore = new MemoryKeyMovementStore();
  const occurrenceStore = new MemoryKeyOccurrenceStore();

  await catalog.createRoom({
    id: "a06",
    name: "A06 - SALA DE AULA - Bloco A (PS)",
    externalRefs: ["A06"]
  });
  await catalog.createKey({
    id: "key-a06",
    code: "CH-A06",
    label: "Chave A06"
  });
  await catalog.createLink({
    keyId: "key-a06",
    roomId: "a06"
  });

  return {
    catalog,
    movementStore,
    occurrenceStore,
    service: new KeyOccurrenceService(catalog, movementStore, occurrenceStore)
  };
}
