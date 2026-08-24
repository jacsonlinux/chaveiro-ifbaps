import { createAppConfig } from "../config/env.js";
import { createReservationProvider } from "./provider-factory.js";
import { createReservationStore } from "./reservation-store-factory.js";
import { ReservationSyncScheduler } from "./reservation-sync-scheduler.js";
import {
  createPinRequestProcessor,
  PinRequestProcessor,
} from "../people/pin-request-processor.js";

const config = createAppConfig();
const reservationStore = createReservationStore(config);
const reservationProvider = createReservationProvider(config, reservationStore);
const scheduler = new ReservationSyncScheduler(
  config,
  reservationProvider,
  reservationStore,
);
const pinRequestProcessor: PinRequestProcessor | undefined =
  config.pinControl.enabled
    ? createPinRequestProcessor(config)
    : undefined;

scheduler.start();
pinRequestProcessor?.start();

// The scheduler timer is intentionally unref'ed so it cannot keep the HTTP
// server alive. This worker has no HTTP server, so keep its process alive.
const keepAlive = setInterval(() => undefined, 60_000);

console.log(
  [
    "chaveiro-ifbaps-sync-worker started",
    `provider=${reservationProvider.name}`,
    `reservationStore=${reservationStore.name}`,
    `intervalMs=${config.reservationSyncSchedule.intervalMs}`,
    `pinRequests=${pinRequestProcessor ? "enabled" : "disabled"}`,
  ].join(" "),
);

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function shutdown(): void {
  clearInterval(keepAlive);
  scheduler.stop();
  pinRequestProcessor?.stop();
  process.exit(0);
}
