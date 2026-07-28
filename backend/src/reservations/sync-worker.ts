import { createAppConfig } from "../config/env.js";
import { createReservationProvider } from "./provider-factory.js";
import { createReservationStore } from "./reservation-store-factory.js";
import { ReservationSyncScheduler } from "./reservation-sync-scheduler.js";

const config = createAppConfig();
const reservationStore = createReservationStore(config);
const reservationProvider = createReservationProvider(config, reservationStore);
const scheduler = new ReservationSyncScheduler(
  config,
  reservationProvider,
  reservationStore,
);

scheduler.start();

console.log(
  [
    "keychain-ifbaps-sync-worker started",
    `provider=${reservationProvider.name}`,
    `reservationStore=${reservationStore.name}`,
    `intervalMs=${config.reservationSyncSchedule.intervalMs}`,
  ].join(" "),
);

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function shutdown(): void {
  scheduler.stop();
  process.exit(0);
}
