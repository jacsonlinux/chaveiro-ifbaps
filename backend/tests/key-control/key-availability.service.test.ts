import { describe, expect, it } from "vitest";
import {
  createCatalogFromSuapRooms,
  KeyAvailabilityService
} from "../../src/key-control/key-availability.service.js";
import type { KeyCatalog } from "../../src/key-control/types.js";
import type {
  NormalizedReservation,
  ReservationListQuery,
  ReservationProvider,
  ReservationSyncResult
} from "../../src/reservations/types.js";
import type {
  OccupancyListQuery,
  OccupancyProvider
} from "../../src/occupancies/occupancy-provider.js";
import type { NormalizedOccupancy } from "../../src/occupancies/types.js";

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

  it("projects SUAP rooms using the room code as the physical key code", () => {
    const catalog = createCatalogFromSuapRooms([
      {
        externalId: "1304",
        roomCode: "C08",
        name: "C08 - LABORATORIO DE INFORMATICA II - Bloco C (PS)",
        campus: "PS",
        building: "Bloco C",
        active: true,
        schedulable: true,
        scheduleUrl: "https://suap.example/comum/sala/solicitar_reserva/1304/",
        sourceUrl: "https://suap.example/admin/comum/sala/",
        firstSeenAt: "2026-07-29T10:00:00.000Z",
        lastSeenAt: "2026-07-29T10:00:00.000Z"
      }
    ]);

    expect(catalog.rooms[0]).toMatchObject({
      id: "1304",
      roomCode: "C08",
      campus: "PS",
      building: "Bloco C",
      active: true,
      schedulable: true,
      scheduleUrl: "https://suap.example/comum/sala/solicitar_reserva/1304/",
      externalRefs: [
        "1304",
        "C08",
        "C08 - LABORATORIO DE INFORMATICA II - Bloco C (PS)"
      ]
    });
    expect(catalog.keys[0]).toMatchObject({
      id: "key-1304",
      code: "C08",
      label: "Chave C08"
    });
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

  it("uses normalized occupancies as the operational availability source", async () => {
    const service = new KeyAvailabilityService(
      createOccupancyProvider([
        createOccupancy("aula-c08", "C08 - LABORATORIO DE INFORMATICA II", "C08", {
          sourceKind: "aula_regular",
          responsibleName: "Professor da Aula",
          responsibleIdentifier: "7654321"
        })
      ]),
      { blockBeforeMinutes: 30 }
    );

    const availability = await service.listAvailability(
      new Date("2026-07-28T14:00:00.000-03:00")
    );
    const serialized = JSON.stringify(availability);

    expect(availability[0]?.status).toBe("bloqueada_por_reserva");
    expect(availability[0]?.key.code).toBe("C08");
    expect(availability[0]?.blockingReservation).toMatchObject({
      externalId: "aula-c08",
      roomName: "C08 - LABORATORIO DE INFORMATICA II",
      status: "active"
    });
    expect(serialized).not.toContain("Professor da Aula");
    expect(serialized).not.toContain("7654321");
  });

  it("matches occupancies by normalized room code when a local catalog exists", async () => {
    const catalog: KeyCatalog = {
      rooms: [
        {
          id: "1304",
          roomCode: "C08",
          name: "C08 - LABORATORIO DE INFORMATICA II",
          externalRefs: ["1304", "C08"]
        }
      ],
      keys: [
        {
          id: "key-1304",
          code: "C08",
          label: "Chave C08",
          baseStatus: "disponivel"
        }
      ],
      links: [{ keyId: "key-1304", roomId: "1304" }]
    };
    const service = new KeyAvailabilityService(
      createOccupancyProvider([
        createOccupancy("aula-c08", "Lab Informatica II", "C08", {
          roomExternalId: undefined,
          sourceKind: "aula_regular"
        })
      ]),
      { blockBeforeMinutes: 30 },
      catalog
    );

    const availability = await service.listAvailability(
      new Date("2026-07-28T14:00:00.000-03:00")
    );

    expect(availability[0]?.status).toBe("bloqueada_por_reserva");
    expect(availability[0]?.blockingReservation?.externalId).toBe("aula-c08");
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

function createOccupancyProvider(
  occupancies: readonly NormalizedOccupancy[]
): OccupancyProvider {
  return {
    name: "test-occupancies",
    async list(_query: OccupancyListQuery) {
      return occupancies;
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

function createOccupancy(
  externalId: string,
  roomName: string,
  roomCode: string,
  overrides: Partial<NormalizedOccupancy> = {}
): NormalizedOccupancy {
  return {
    externalId,
    source: "suap-web",
    sourceKind: "reserva_deferida",
    sourceUrl: "/comum/sala/ver_solicitacao/44487/",
    requestExternalId: "44487",
    roomName,
    roomExternalId: roomCode,
    roomCode,
    campus: "PS",
    startsAt: "2026-07-28T14:00:00.000-03:00",
    endsAt: "2026-07-28T17:00:00.000-03:00",
    responsibleName: "Pessoa Exemplo",
    responsibleIdentifier: "0000000",
    purpose: "Aula",
    status: "active",
    blocksKey: true,
    fingerprint: `fingerprint-${externalId}`,
    firstSeenAt: "2026-07-28T10:00:00.000Z",
    lastSeenAt: "2026-07-28T10:00:00.000Z",
    lastSyncedAt: "2026-07-28T10:00:00.000Z",
    ...overrides
  };
}
