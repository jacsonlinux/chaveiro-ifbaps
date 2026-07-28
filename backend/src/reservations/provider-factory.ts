import type { AppConfig } from "../config/env.js";
import type { ReservationProvider } from "./types.js";
import { LocalReservationProvider } from "./local-reservation.provider.js";
import { SuapApiReservationProvider } from "./suap-api-reservation.provider.js";
import { SuapWebReadOnlyReservationProvider } from "./suap-web-readonly-reservation.provider.js";
import type { ReservationStore } from "./reservation-store.js";

export function createReservationProvider(
  config: AppConfig,
  reservationStore: ReservationStore
): ReservationProvider {
  switch (config.reservationProvider) {
    case "api":
      return new SuapApiReservationProvider();
    case "web-readonly":
      return new SuapWebReadOnlyReservationProvider(config, reservationStore);
    case "local":
    default:
      return new LocalReservationProvider();
  }
}
