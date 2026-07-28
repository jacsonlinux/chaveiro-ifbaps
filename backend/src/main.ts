import { createAppConfig } from "./config/env.js";
import { createApp } from "./app.js";
import { createReservationProvider } from "./reservations/provider-factory.js";
import { createReservationStore } from "./reservations/reservation-store-factory.js";
import { ReservationSyncScheduler } from "./reservations/reservation-sync-scheduler.js";
import { KeyAvailabilityService } from "./key-control/key-availability.service.js";
import { createKeyCatalogStore } from "./key-control/key-catalog-store-factory.js";

const config = createAppConfig();
const reservationStore = createReservationStore(config);
const reservationProvider = createReservationProvider(config, reservationStore);
const keyCatalogStore = createKeyCatalogStore(config);
const reservationSyncScheduler = new ReservationSyncScheduler(
  config,
  reservationProvider,
  reservationStore
);
const keyAvailabilityService = new KeyAvailabilityService(reservationProvider, {
  blockBeforeMinutes: config.keyControl.reservationBlockBeforeMinutes
}, keyCatalogStore);
const server = createApp(
  config,
  reservationProvider,
  reservationSyncScheduler,
  keyAvailabilityService,
  keyCatalogStore
);

reservationSyncScheduler.start();

server.listen(config.port, () => {
  console.log(
    `keychain-ifbaps-backend listening on port ${config.port} with ${reservationProvider.name} provider, ${reservationStore.name} reservation store and ${keyCatalogStore.name} key catalog store`
  );
});

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function shutdown(): void {
  reservationSyncScheduler.stop();
  server.close(() => {
    process.exit(0);
  });
}
