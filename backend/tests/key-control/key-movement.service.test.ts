import { describe, expect, it } from "vitest";
import { KeyAvailabilityService } from "../../src/key-control/key-availability.service.js";
import { MemoryKeyCatalogStore } from "../../src/key-control/memory-key-catalog.store.js";
import { KeyMovementService } from "../../src/key-control/key-movement.service.js";
import { MemoryKeyMovementStore } from "../../src/key-control/memory-key-movement.store.js";
import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationProvider,
  ReservationSyncResult
} from "../../src/reservations/types.js";

describe("KeyMovementService", () => {
  it("registers a withdrawal and return with audit fields", async () => {
    const { catalog, service } = await createService([]);

    const withdrawal = await service.registerWithdrawal({
      keyId: "key-a06",
      roomId: "a06",
      responsibleName: "Pessoa Responsavel",
      responsibleIdentifier: "2180000",
      actorName: "Portaria",
      actorIdentifier: "portaria-01",
      occurredAt: "2026-07-28T08:00:00.000-03:00",
      expectedReturnAt: "2026-07-28T09:00:00.000-03:00",
      notes: "Retirada registrada no balcao."
    });
    const withdrawnKey = (await catalog.listKeys())[0];

    expect(withdrawal).toMatchObject({
      keyId: "key-a06",
      roomId: "a06",
      status: "retirada",
      origin: "portaria",
      responsibleName: "Pessoa Responsavel",
      checkedOutByName: "Portaria",
      checkedOutAt: "2026-07-28T11:00:00.000Z",
      expectedReturnAt: "2026-07-28T12:00:00.000Z"
    });
    expect(withdrawnKey?.baseStatus).toBe("retirada");

    const returned = await service.registerReturn({
      keyId: "key-a06",
      actorName: "Portaria",
      actorIdentifier: "portaria-01",
      occurredAt: "2026-07-28T10:00:00.000-03:00",
      notes: "Devolvida sem ocorrencia."
    });
    const availableKey = (await catalog.listKeys())[0];

    expect(returned).toMatchObject({
      id: withdrawal.id,
      status: "devolvida",
      returnedByName: "Portaria",
      returnedAt: "2026-07-28T13:00:00.000Z",
      returnNotes: "Devolvida sem ocorrencia."
    });
    expect(availableKey?.baseStatus).toBe("disponivel");
  });

  it("does not allow a second open withdrawal for the same key", async () => {
    const { service } = await createService([]);

    await service.registerWithdrawal(createWithdrawalInput());

    await expect(
      service.registerWithdrawal({
        ...createWithdrawalInput(),
        responsibleName: "Outra Pessoa"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "key_already_checked_out"
    });
  });

  it("does not allow withdrawal when a reservation blocks the key", async () => {
    const { service } = await createService([
      createReservation("res-a06", "A06 - SALA DE AULA - Bloco A (PS)", "A06")
    ]);

    await expect(
      service.registerWithdrawal({
        ...createWithdrawalInput(),
        occurredAt: "2026-07-28T13:30:00.000-03:00"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "key_not_available"
    });
  });

  it("derives late status from expected return time", async () => {
    const { service } = await createService([]);

    const withdrawal = await service.registerWithdrawal({
      ...createWithdrawalInput(),
      occurredAt: "2020-01-01T09:00:00.000Z",
      expectedReturnAt: "2020-01-01T10:00:00.000Z"
    });
    const late = await service.list({ status: "atrasada" });
    const open = await service.list({ status: "retirada" });

    expect(late).toMatchObject([
      {
        id: withdrawal.id,
        status: "atrasada",
        expectedReturnAt: "2020-01-01T10:00:00.000Z"
      }
    ]);
    expect(open).toHaveLength(0);
  });

  it("requires expected return after withdrawal time", async () => {
    const { service } = await createService([]);

    await expect(
      service.registerWithdrawal({
        ...createWithdrawalInput(),
        occurredAt: "2026-07-28T09:00:00.000Z",
        expectedReturnAt: "2026-07-28T09:00:00.000Z"
      })
    ).rejects.toMatchObject({
      code: "invalid_expected_return"
    });
  });
});

async function createService(reservations: readonly NormalizedReservation[]) {
  const catalog = new MemoryKeyCatalogStore();
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

  const movementStore = new MemoryKeyMovementStore();
  const availability = new KeyAvailabilityService(
    createProvider(reservations),
    { blockBeforeMinutes: 30 },
    catalog
  );

  return {
    catalog,
    service: new KeyMovementService(catalog, movementStore, availability)
  };
}

function createWithdrawalInput() {
  return {
    keyId: "key-a06",
    roomId: "a06",
    responsibleName: "Pessoa Responsavel",
    actorName: "Portaria",
    occurredAt: "2026-07-28T08:00:00.000-03:00"
  };
}

function createProvider(
  reservations: readonly NormalizedReservation[]
): ReservationProvider {
  return {
    name: "test",
    async list(_query: ReservationListQuery) {
      return reservations;
    },
    async sync(): Promise<ReservationSyncResult> {
      return {
        provider: "test",
        syncedAt: "2026-07-28T10:00:00.000Z",
        created: 0,
        updated: 0,
        unchanged: reservations.length,
        absent: 0,
        canceled: 0,
        conflicted: 0,
        failed: 0,
        reservations
      };
    }
  };
}

function createReservation(
  externalId: string,
  roomName: string,
  roomExternalId: string
): NormalizedReservation {
  return {
    externalId,
    source: "suap-web",
    roomName,
    roomExternalId,
    campus: "PS",
    startsAt: "2026-07-28T14:00:00.000-03:00",
    endsAt: "2026-07-28T17:00:00.000-03:00",
    responsibleName: "Pessoa Exemplo",
    responsibleIdentifier: "0000000",
    purpose: "Aula",
    status: "active",
    fingerprint: `fingerprint-${externalId}`,
    firstSeenAt: "2026-07-28T10:00:00.000Z",
    lastSeenAt: "2026-07-28T10:00:00.000Z",
    lastSyncedAt: "2026-07-28T10:00:00.000Z"
  };
}
