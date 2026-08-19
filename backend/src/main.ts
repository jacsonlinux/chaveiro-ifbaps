import { createAppConfig } from "./config/env.js";
import { createApp } from "./app.js";
import { createReservationProvider } from "./reservations/provider-factory.js";
import { createReservationStore } from "./reservations/reservation-store-factory.js";
import { ReservationSyncScheduler } from "./reservations/reservation-sync-scheduler.js";
import { createOccupancyProvider } from "./occupancies/occupancy-provider.js";
import { KeyAvailabilityService } from "./key-control/key-availability.service.js";
import { createKeyCatalogStore } from "./key-control/key-catalog-store-factory.js";
import { KeyMovementService } from "./key-control/key-movement.service.js";
import { createKeyMovementStore } from "./key-control/key-movement-store-factory.js";
import { KeyOccurrenceService } from "./key-control/key-occurrence.service.js";
import { createKeyOccurrenceStore } from "./key-control/key-occurrence-store-factory.js";
import { AuthService } from "./auth/auth-service.js";
import { createAuthSessionStore } from "./auth/session-store-factory.js";
import { SuapOAuthClient } from "./auth/suap-oauth-client.js";
import { createUserStore } from "./users/user-store-factory.js";
import { FirebaseAdminTokenVerifier } from "./auth/firebase-token-verifier.js";

const config = createAppConfig();
const reservationStore = createReservationStore(config);
const reservationProvider = createReservationProvider(config, reservationStore);
const occupancyProvider = createOccupancyProvider(
  reservationProvider,
  reservationStore,
);
const keyCatalogStore = createKeyCatalogStore(config);
const keyMovementStore = createKeyMovementStore(config);
const keyOccurrenceStore = createKeyOccurrenceStore(config);
const userStore = createUserStore(config);
const authSessionStore = createAuthSessionStore(config);
const reservationSyncScheduler = new ReservationSyncScheduler(
  config,
  reservationProvider,
  reservationStore,
);
const keyAvailabilityService = new KeyAvailabilityService(
  occupancyProvider,
  {
    blockBeforeMinutes: config.keyControl.reservationBlockBeforeMinutes,
  },
  keyCatalogStore,
);
const keyMovementService = new KeyMovementService(
  keyCatalogStore,
  keyMovementStore,
  keyAvailabilityService,
);
const keyOccurrenceService = new KeyOccurrenceService(
  keyCatalogStore,
  keyMovementStore,
  keyOccurrenceStore,
);
const authService = new AuthService(
  config,
  authSessionStore,
  new SuapOAuthClient(config),
  userStore,
  config.auth.mode === "firebase"
    ? new FirebaseAdminTokenVerifier(config)
    : undefined,
);
const server = createApp(
  config,
  reservationProvider,
  reservationSyncScheduler,
  keyAvailabilityService,
  keyCatalogStore,
  keyMovementService,
  authService,
  userStore,
  keyOccurrenceService,
  reservationStore,
);

server.listen(config.port, () => {
  console.log(
    [
      `keychain-ifbaps-backend listening on port ${config.port}`,
      `provider=${reservationProvider.name}`,
      `reservationStore=${reservationStore.name}`,
      `keyCatalogStore=${keyCatalogStore.name}`,
      `keyMovementStore=${keyMovementStore.name}`,
      `keyOccurrenceStore=${keyOccurrenceStore.name}`,
      `userStore=${userStore.name}`,
      `authSessionStore=${authSessionStore.name}`,
      "syncScheduler=external-worker",
    ].join(" "),
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
