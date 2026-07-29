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
        roomCode: "A06",
        name: "A06 - SALA DE AULA",
        building: "Bloco A",
        floor: "Térreo",
        active: true,
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
      roomCode: "C02",
      name: "C02 atualizado",
      active: true,
      schedulable: true
    });
  });

  it("aligns SUAP admin headers when the actions column has no body cell", () => {
    const rooms = parseSuapRoomTableRows(
      ["#", "Nome", "Campus / Prédio", "Ativa", "Agendável", "Avaliadores", "Opções"],
      [
        {
          cells: [
            "A02 - SALA DE AULA",
            "PS / Bloco A",
            "",
            "",
            "Avaliador",
            "Solicitar/Ver Reservas"
          ],
          links: [
            { text: "", href: "/admin/comum/sala/1281/change/?_changelist_filters=agendavel__exact%3D1" },
            { text: "Visualizar", href: "/admin/comum/sala/1281/view/" },
            { text: "Solicitar/Ver Reservas", href: "/comum/sala/solicitar_reserva/1281/" }
          ]
        }
      ],
      "https://suap.example/admin/comum/sala/?agendavel__exact=1",
      "2026-07-28T18:00:00.000Z"
    );

    expect(rooms[0]).toMatchObject({
      externalId: "1281",
      roomCode: "A02",
      name: "A02 - SALA DE AULA",
      campus: "PS",
      building: "Bloco A",
      active: true,
      scheduleUrl: "https://suap.example/comum/sala/solicitar_reserva/1281/",
      schedulable: true
    });
  });

  it("preserves inactive and non-schedulable room options from SUAP", () => {
    const rooms = parseSuapRoomTableRows(
      ["Nome", "Campus / Prédio", "Ativa", "Agendável", "Opções"],
      [
        {
          cells: ["B07 - LABORATORIO", "PS / Bloco B", "Não", "Não", ""],
          links: [{ text: "Editar", href: "/admin/comum/sala/1407/change/" }]
        }
      ],
      "https://suap.example/admin/comum/sala/",
      "2026-07-28T18:00:00.000Z"
    );

    expect(rooms[0]).toMatchObject({
      externalId: "1407",
      roomCode: "B07",
      campus: "PS",
      building: "Bloco B",
      active: false,
      schedulable: false
    });
    expect(rooms[0]?.scheduleUrl).toBeUndefined();
  });
});
