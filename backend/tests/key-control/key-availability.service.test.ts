import { describe, expect, it } from "vitest";
import { KeyAvailabilityService } from "../../src/key-control/key-availability.service.js";
import type { KeyCatalog } from "../../src/key-control/types.js";
import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationProvider,
  ReservationSyncResult
} from "../../src/reservations/types.js";

describe("KeyAvailabilityService", () => {
  it("creates a provisional key catalog from every reserved room", async () => {
    const service = new KeyAvailabilityService(
      createProvider([
        createReservation("a06", "A06 - SALA DE AULA - Bloco A (PS)", "A06"),
        createReservation("c02", "C02 - SALA DE AULA - Bloco C (PS)", "C02"),
        createReservation("lab1", "Laboratorio 01 - Bloco D (PS)", "LAB1")
      ]),
      { blockBeforeMinutes: 30 }
    );

    const availability = await service.listAvailability(
      new Date("2026-07-28T16:30:00.000-03:00")
    );

    expect(availability).toHaveLength(3);
    expect(availability.map((item) => item.key.code).sort()).toEqual([
      "A06",
      "C02",
      "LAB1"
    ]);
    expect(availability.every((item) => item.key.provisional)).toBe(true);
    expect(availability.every((item) => item.rooms[0]?.provisional)).toBe(true);
  });

  it("blocks an available key only during the reservation interval", async () => {
    const service = new KeyAvailabilityService(
      createProvider([
        createReservation("a06", "A06 - SALA DE AULA - Bloco A (PS)", "A06", {
          startsAt: "2026-07-28T14:00:00.000-03:00",
          endsAt: "2026-07-28T17:00:00.000-03:00"
        })
      ]),
      { blockBeforeMinutes: 30 }
    );

    await expectStatus(service, "2026-07-28T13:59:00.000-03:00", "disponivel");
    await expectStatus(
      service,
      "2026-07-28T14:00:00.000-03:00",
      "bloqueada_por_reserva"
    );
    await expectStatus(
      service,
      "2026-07-28T14:30:00.000-03:00",
      "bloqueada_por_reserva"
    );
    await expectStatus(service, "2026-07-28T17:00:00.000-03:00", "disponivel");
  });

  it("does not expose responsible person data in the blocking reservation", async () => {
    const service = new KeyAvailabilityService(
      createProvider([
        createReservation("a06", "A06 - SALA DE AULA - Bloco A (PS)", "A06", {
          responsibleName: "Pessoa Sensivel",
          responsibleIdentifier: "1234567"
        })
      ]),
      { blockBeforeMinutes: 30 }
    );

    const availability = await service.listAvailability(
      new Date("2026-07-28T14:00:00.000-03:00")
    );
    const serialized = JSON.stringify(availability);

    expect(availability[0]?.blockingReservation).toMatchObject({
      externalId: "a06",
      roomName: "A06 - SALA DE AULA - Bloco A (PS)",
      status: "active"
    });
    expect(serialized).not.toContain("Pessoa Sensivel");
    expect(serialized).not.toContain("1234567");
  });

  it("preserves non-available local key states over reservation blocking", async () => {
    const catalog: KeyCatalog = {
      rooms: [
        {
          id: "a06",
          name: "A06 - SALA DE AULA - Bloco A (PS)",
          externalRefs: ["A06"]
        }
      ],
      keys: [
        {
          id: "key-a06",
          code: "A06",
          label: "Chave A06",
          baseStatus: "retirada"
        }
      ],
      links: [{ keyId: "key-a06", roomId: "a06" }]
    };
    const service = new KeyAvailabilityService(
      createProvider([
        createReservation("a06", "A06 - SALA DE AULA - Bloco A (PS)", "A06")
      ]),
      { blockBeforeMinutes: 30 },
      catalog
    );

    const availability = await service.listAvailability(
      new Date("2026-07-28T14:00:00.000-03:00")
    );

    expect(availability[0]?.status).toBe("retirada");
    expect(availability[0]?.blockingReservation?.externalId).toBe("a06");
  });

  it("shows late status when an open withdrawal is past expected return", async () => {
    const catalog: KeyCatalog = {
      rooms: [
        {
          id: "a06",
          name: "A06 - SALA DE AULA - Bloco A (PS)",
          externalRefs: ["A06"]
        }
      ],
      keys: [
        {
          id: "key-a06",
          code: "A06",
          label: "Chave A06",
          baseStatus: "retirada"
        }
      ],
      links: [{ keyId: "key-a06", roomId: "a06" }]
    };
    const service = new KeyAvailabilityService(
      createProvider([]),
      { blockBeforeMinutes: 30 },
      catalog,
      {
        async findOpenByKey(_keyId: string) {
          return {
            status: "retirada" as const,
            expectedReturnAt: "2026-07-28T12:00:00.000Z"
          };
        }
      }
    );

    const availability = await service.listAvailability(
      new Date("2026-07-28T13:00:00.000Z")
    );

    expect(availability[0]?.status).toBe("atrasada");
  });

  it("ignores canceled and missing reservations for blocking", async () => {
    const service = new KeyAvailabilityService(
      createProvider([
        createReservation("cancelada", "Sala Cancelada", "CAN", {
          status: "canceled"
        }),
        createReservation("ausente", "Sala Ausente", "ABS", {
          status: "absent"
        }),
        createReservation("suspeita", "Sala Suspeita", "SUS", {
          status: "suspect_absent"
        })
      ]),
      { blockBeforeMinutes: 30 }
    );

    await expect(service.listAvailability()).resolves.toHaveLength(0);
  });

  it("shows suspect absent reservations as attention without blocking the key", async () => {
    const catalog: KeyCatalog = {
      rooms: [
        {
          id: "a06",
          name: "A06 - SALA DE AULA - Bloco A (PS)",
          externalRefs: ["A06"]
        }
      ],
      keys: [
        {
          id: "key-a06",
          code: "A06",
          label: "Chave A06",
          baseStatus: "disponivel"
        }
      ],
      links: [{ keyId: "key-a06", roomId: "a06" }]
    };
    const service = new KeyAvailabilityService(
      createProvider([
        createReservation("suspeita", "A06 - SALA DE AULA - Bloco A (PS)", "A06", {
          status: "suspect_absent",
          responsibleName: "Pessoa Sensivel",
          responsibleIdentifier: "1234567"
        })
      ]),
      { blockBeforeMinutes: 30 },
      catalog
    );

    const availability = await service.listAvailability(
      new Date("2026-07-28T14:00:00.000-03:00")
    );
    const serialized = JSON.stringify(availability);

    expect(availability[0]?.status).toBe("disponivel");
    expect(availability[0]?.blockingReservation).toBeUndefined();
    expect(availability[0]?.reservationAttention).toMatchObject({
      externalId: "suspeita",
      roomName: "A06 - SALA DE AULA - Bloco A (PS)",
      status: "suspect_absent"
    });
    expect(serialized).not.toContain("Pessoa Sensivel");
    expect(serialized).not.toContain("1234567");
  });

  it("ignores disabled local rooms, keys and links", async () => {
    const catalog: KeyCatalog = {
      rooms: [
        {
          id: "a06",
          name: "A06",
          externalRefs: ["A06"]
        },
        {
          id: "c02",
          name: "C02",
          externalRefs: ["C02"],
          disabledAt: "2026-07-28T10:00:00.000Z"
        }
      ],
      keys: [
        {
          id: "key-a06",
          code: "A06",
          label: "Chave A06",
          baseStatus: "disponivel"
        },
        {
          id: "key-c02",
          code: "C02",
          label: "Chave C02",
          baseStatus: "disponivel",
          disabledAt: "2026-07-28T10:00:00.000Z"
        },
        {
          id: "key-sem-link",
          code: "SEM",
          label: "Chave sem link",
          baseStatus: "disponivel"
        }
      ],
      links: [
        { keyId: "key-a06", roomId: "a06" },
        { keyId: "key-c02", roomId: "c02" },
        {
          keyId: "key-sem-link",
          roomId: "a06",
          disabledAt: "2026-07-28T10:00:00.000Z"
        }
      ]
    };
    const service = new KeyAvailabilityService(createProvider([]), {
      blockBeforeMinutes: 30
    }, catalog);

    const availability = await service.listAvailability();

    expect(availability).toHaveLength(1);
    expect(availability[0]?.key.id).toBe("key-a06");
  });
});

async function expectStatus(
  service: KeyAvailabilityService,
  at: string,
  expected: string
): Promise<void> {
  const availability = await service.listAvailability(new Date(at));

  expect(availability[0]?.status).toBe(expected);
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
  roomExternalId: string,
  overrides: Partial<NormalizedReservation> = {}
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
    lastSyncedAt: "2026-07-28T10:00:00.000Z",
    ...overrides
  };
}
