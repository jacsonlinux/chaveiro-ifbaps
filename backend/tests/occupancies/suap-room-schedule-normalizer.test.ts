import { describe, expect, it } from "vitest";
import {
  normalizeSuapRoomScheduleText,
  parseSuapRoomScheduleEntries
} from "../../src/occupancies/suap-room-schedule-normalizer.js";

describe("SUAP room schedule normalizer", () => {
  it("parses schedule entries from the room agenda text", () => {
    const entries = parseSuapRoomScheduleEntries(
      [
        "Agenda Atual da Sala",
        "Julho/2026",
        "Dom Seg Ter Qua Qui Sex Sab",
        "28",
        "14:00 às 16:30",
        "Atividades PIBID Fisica Danilo",
        "29",
        "07:30 às 10:30",
        "3TI-B LP-2 Robertta Gondim",
        "09:00 às 10:30",
        "3TI-B Redes 1 Ricardo Cunha",
        "Formulario de Solicitacao"
      ].join("\n")
    );

    expect(entries).toEqual([
      {
        date: "2026-07-28",
        startsAt: "2026-07-28T14:00:00.000-03:00",
        endsAt: "2026-07-28T16:30:00.000-03:00",
        description: "Atividades PIBID Fisica Danilo"
      },
      {
        date: "2026-07-29",
        startsAt: "2026-07-29T07:30:00.000-03:00",
        endsAt: "2026-07-29T10:30:00.000-03:00",
        description: "3TI-B LP-2 Robertta Gondim"
      },
      {
        date: "2026-07-29",
        startsAt: "2026-07-29T09:00:00.000-03:00",
        endsAt: "2026-07-29T10:30:00.000-03:00",
        description: "3TI-B Redes 1 Ricardo Cunha"
      }
    ]);
  });

  it("filters out past dates when a future-only window is provided", () => {
    const entries = parseSuapRoomScheduleEntries(
      [
        "Julho/2026",
        "28",
        "14:00 às 16:30",
        "Evento antigo",
        "29",
        "07:30 às 10:30",
        "Aula atual"
      ].join("\n"),
      { fromDate: "2026-07-29" }
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.date).toBe("2026-07-29");
  });

  it("normalizes native class schedule entries as blocking occupancies", () => {
    const occupancies = normalizeSuapRoomScheduleText({
      text: [
        "Solicitar Reserva: C08 - LABORATORIO DE INFORMATICA II - Bloco C (PS)",
        "Julho/2026",
        "29",
        "07:30 às 10:30",
        "3TI-B LP-2 Robertta Gondim",
        "Formulario de Solicitacao"
      ].join("\n"),
      sourceUrl: "https://suap.example/comum/sala/solicitar_reserva/1304/",
      roomExternalId: "1304",
      roomCode: "C08",
      roomName: "C08 - LABORATORIO DE INFORMATICA II - Bloco C (PS)",
      campus: "PS",
      syncedAt: "2026-07-29T10:00:00.000Z",
      fromDate: "2026-07-29"
    });

    expect(occupancies).toHaveLength(1);
    expect(occupancies[0]).toMatchObject({
      source: "suap-web",
      sourceKind: "aula_regular",
      sourceUrl: "https://suap.example/comum/sala/solicitar_reserva/1304/",
      roomExternalId: "1304",
      roomCode: "C08",
      campus: "PS",
      startsAt: "2026-07-29T07:30:00.000-03:00",
      endsAt: "2026-07-29T10:30:00.000-03:00",
      responsibleName: "Robertta Gondim",
      purpose: "3TI-B LP-2 Robertta Gondim",
      status: "active",
      blocksKey: true,
      rawVersion: "suap-room-schedule-text-v1"
    });
    expect(occupancies[0]?.externalId).toMatch(
      /^suap-room-schedule-1304-2026-07-29-[a-f0-9]{24}$/
    );
    expect(occupancies[0]?.fingerprint).toHaveLength(64);
  });
});
