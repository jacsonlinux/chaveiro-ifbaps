import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AppConfig } from "./config/env.js";
import { publicConfig } from "./config/env.js";
import { toHttpError } from "./http/errors.js";
import { getRequestUrl, sendJson } from "./http/json.js";
import type {
  ReservationProvider,
  ReservationStatus
} from "./reservations/types.js";
import type { ReservationSyncScheduler } from "./reservations/reservation-sync-scheduler.js";

export function createApp(
  config: AppConfig,
  reservationProvider: ReservationProvider,
  reservationSyncScheduler?: ReservationSyncScheduler
): Server {
  return createServer(async (request, response) => {
    try {
      const url = getRequestUrl(request);

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          status: "ok",
          service: "keychain-ifbaps-backend",
          checkedAt: new Date().toISOString(),
          config: publicConfig(config)
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/reservations") {
        const reservations = await reservationProvider.list(
          getReservationQuery(request)
        );
        sendJson(response, 200, {
          provider: reservationProvider.name,
          count: reservations.length,
          results: reservations
        });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/reservations/sync"
      ) {
        const result = await reservationProvider.sync();
        sendJson(response, 200, result);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/reservations/sync/status"
      ) {
        sendJson(response, 200, {
          scheduler: reservationSyncScheduler?.status() ?? {
            enabled: false,
            running: false
          }
        });
        return;
      }

      sendJson(response, 404, {
        error: {
          code: "not_found",
          message: "Endpoint nao encontrado."
        }
      });
    } catch (error) {
      const httpError = toHttpError(error);
      sendJson(response, httpError.statusCode, {
        error: {
          code: httpError.code,
          message: httpError.message
        }
      });
    }
  });
}

function getReservationQuery(request: IncomingMessage) {
  const url = getRequestUrl(request);

  return {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    roomName: url.searchParams.get("roomName") ?? undefined,
    status: parseReservationStatus(url.searchParams.get("status"))
  };
}

function parseReservationStatus(value: string | null): ReservationStatus | undefined {
  if (
    value === "active" ||
    value === "changed" ||
    value === "suspect_absent" ||
    value === "absent" ||
    value === "canceled" ||
    value === "conflicted"
  ) {
    return value;
  }

  return undefined;
}
