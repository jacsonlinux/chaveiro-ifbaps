import type { AppConfig } from "../config/env.js";
import type { ReservationProvider } from "./types.js";
import { LocalReservationProvider } from "./local-reservation.provider.js";
import { SuapApiReservationProvider } from "./suap-api-reservation.provider.js";
import { SuapWebReadOnlyReservationProvider } from "./suap-web-readonly-reservation.provider.js";

export function createReservationProvider(
  config: AppConfig
): ReservationProvider {
  switch (config.reservationProvider) {
    case "api":
      return new SuapApiReservationProvider();
    case "web-readonly":
      return new SuapWebReadOnlyReservationProvider(config);
    case "local":
    default:
      return new LocalReservationProvider();
  }
}
