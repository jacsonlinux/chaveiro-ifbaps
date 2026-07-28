import { describe, expect, it } from "vitest";
import {
  createSuapRoomTargets,
  extractSuapRoomIdFromReservationUrl
} from "../src/reservations/suap-reservation-targets.js";

describe("SUAP reservation targets", () => {
  it("extracts the room id from solicitar_reserva urls", () => {
    expect(
      extractSuapRoomIdFromReservationUrl(
        "https://suap.ifba.edu.br/comum/sala/solicitar_reserva/1281/"
      )
    ).toBe("1281");
  });

  it("ignores unrelated urls when building room targets", () => {
    expect(
      createSuapRoomTargets([
        "https://suap.ifba.edu.br/comum/sala/solicitar_reserva/1281/",
        "https://suap.ifba.edu.br/comum/sala/reservasala_relat/",
        "not-a-url"
      ])
    ).toEqual([
      {
        url: "https://suap.ifba.edu.br/comum/sala/solicitar_reserva/1281/",
        roomId: "1281"
      }
    ]);
  });
});
