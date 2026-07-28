import { describe, expect, it } from "vitest";
import { SuapWebReadOnlyReservationProvider } from "../src/reservations/suap-web-readonly-reservation.provider.js";
import { MemoryReservationStore } from "../src/reservations/memory-reservation.store.js";
import { createTestAppConfig } from "./helpers/app-config.js";

describe("SuapWebReadOnlyReservationProvider", () => {
  it("keeps scraping disabled behind feature flag", async () => {
    const provider = new SuapWebReadOnlyReservationProvider(
      createTestAppConfig({
      suap: {
        webReadonlyEnabled: false
      }
      }),
      new MemoryReservationStore()
    );

    await expect(provider.sync()).rejects.toMatchObject({
      statusCode: 503,
      code: "suap_web_readonly_disabled"
    });
  });
});
