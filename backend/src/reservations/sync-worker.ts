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

// The scheduler timer is intentionally unref'ed so it cannot keep the HTTP
// server alive. This worker has no HTTP server, so keep its process alive.
const keepAlive = setInterval(() => undefined, 60_000);

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
  clearInterval(keepAlive);
  scheduler.stop();
  process.exit(0);
}
