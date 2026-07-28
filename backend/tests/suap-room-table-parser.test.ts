import { describe, expect, it } from "vitest";
import { parseSuapRoomTableRows } from "../src/reservations/suap-room-table-parser.js";

describe("parseSuapRoomTableRows", () => {
  it("extracts the SUAP room id from the administrative link", () => {
    const rooms = parseSuapRoomTableRows(
      ["Ações", "Nome", "Prédio", "Pavimento", "Agendável"],
      [
        {
          cells: ["", "A06 - SALA DE AULA", "Bloco A", "Térreo", "Sim"],
          links: [
            {
              text: "Editar",
              href: "/admin/comum/sala/1281/change/"
            }
          ]
        }
      ],
      "https://suap.example/admin/comum/sala/?agendavel__exact=1",
      "2026-07-28T18:00:00.000Z"
    );

    expect(rooms).toEqual([
      {
        externalId: "1281",
        name: "A06 - SALA DE AULA",
        building: "Bloco A",
        floor: "Térreo",
        schedulable: true,
        sourceUrl: "https://suap.example/admin/comum/sala/?agendavel__exact=1",
        firstSeenAt: "2026-07-28T18:00:00.000Z",
        lastSeenAt: "2026-07-28T18:00:00.000Z"
      }
    ]);
  });

  it("deduplicates rows by external id and preserves an explicit false status", () => {
    const rooms = parseSuapRoomTableRows(
      ["Nome", "Agendável"],
      [
        {
          cells: ["C02", "Não"],
          links: [{ text: "C02", href: "/admin/comum/sala/1302/" }]
        },
        {
          cells: ["C02 atualizado", "Sim"],
          links: [{ text: "C02", href: "/admin/comum/sala/1302/" }]
        }
      ],
      "https://suap.example/admin/comum/sala/",
      "2026-07-28T18:00:00.000Z"
    );

    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({
      externalId: "1302",
      name: "C02 atualizado",
      schedulable: true
    });
  });
});
