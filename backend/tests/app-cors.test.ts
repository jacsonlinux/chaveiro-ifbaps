import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type {
  ReservationListQuery,
  ReservationProvider,
} from "../src/reservations/types.js";
import { createTestAppConfig } from "./helpers/app-config.js";

let server: Server | undefined;

afterEach(async () => {
  if (!server) {
    return;
  }
  server.close();
  await once(server, "close");
  server = undefined;
});

describe("CORS for the hosted PWA", () => {
  it("allows credentialed requests and Firebase authorization headers", async () => {
    const baseUrl = await startApp();
    const response = await fetch(`${baseUrl}/health`, {
      headers: { origin: "https://keychain-ifbaps.web.app" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://keychain-ifbaps.web.app",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("answers the preflight without requiring application authentication", async () => {
    const baseUrl = await startApp();
    const response = await fetch(`${baseUrl}/api/keys/availability`, {
      method: "OPTIONS",
      headers: {
        origin: "https://keychain-ifbaps.web.app",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization, content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
  });

  it("does not allow an unknown origin", async () => {
    const baseUrl = await startApp();
    const response = await fetch(`${baseUrl}/health`, {
      headers: { origin: "https://unknown.example" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

async function startApp(): Promise<string> {
  const provider: ReservationProvider = {
    name: "test",
    async list(_query: ReservationListQuery) {
      return [];
    },
    async sync() {
      return {
        provider: "test",
        syncedAt: new Date().toISOString(),
        created: 0,
        updated: 0,
        unchanged: 0,
        absent: 0,
        canceled: 0,
        conflicted: 0,
        failed: 0,
        reservations: [],
      };
    },
  };
  server = createApp(
    createTestAppConfig({
      cors: {
        enabled: true,
        allowedOrigins: ["https://keychain-ifbaps.web.app"],
      },
    }),
    provider,
  ).listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
