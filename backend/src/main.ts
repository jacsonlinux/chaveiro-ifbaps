import { createAppConfig } from "./config/env.js";
import { createApp } from "./app.js";
import { createReservationProvider } from "./reservations/provider-factory.js";

const config = createAppConfig();
const reservationProvider = createReservationProvider(config);
const server = createApp(config, reservationProvider);

server.listen(config.port, () => {
  console.log(
    `keychain-ifbaps-backend listening on port ${config.port} with ${reservationProvider.name} provider`
  );
});
