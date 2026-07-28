import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AppConfig } from "./config/env.js";
import { publicConfig } from "./config/env.js";
import { getAuthContext, requirePermission } from "./auth/auth-context.js";
import type { AuthService } from "./auth/auth-service.js";
import { HttpError, toHttpError } from "./http/errors.js";
import { getRequestUrl, readJsonBody, sendJson } from "./http/json.js";
import type {
  ReservationProvider,
  ReservationStatus
} from "./reservations/types.js";
import type { ReservationSyncScheduler } from "./reservations/reservation-sync-scheduler.js";
import type { KeyAvailabilityService } from "./key-control/key-availability.service.js";
import type {
  KeyMovementListQuery,
  KeyMovementStatus
} from "./key-control/key-movement.store.js";
import type { KeyMovementService } from "./key-control/key-movement.service.js";
import type {
  CreateKeyInput,
  CreateKeyRoomLinkInput,
  CreateRoomInput,
  KeyCatalogStore
} from "./key-control/key-catalog.store.js";
import { isKeyOperationalStatus } from "./key-control/key-catalog-validation.js";
import type { UserStore } from "./users/user.store.js";

export function createApp(
  config: AppConfig,
  reservationProvider: ReservationProvider,
  reservationSyncScheduler?: ReservationSyncScheduler,
  keyAvailabilityService?: KeyAvailabilityService,
  keyCatalogStore?: KeyCatalogStore,
  keyMovementService?: KeyMovementService,
  authService?: AuthService,
  userStore?: UserStore
): Server {
  return createServer(async (request, response) => {
    try {
      const url = getRequestUrl(request);
      const auth = authService
        ? await authService.getAuthContext(request)
        : getAuthContext(config, request);

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          status: "ok",
          service: "keychain-ifbaps-backend",
          checkedAt: new Date().toISOString(),
          config: publicConfig(config)
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/auth/suap/login") {
        const login = requireAuthService(authService).startSuapLogin();
        response.statusCode = 302;
        response.setHeader("location", login.authorizationUrl);
        response.setHeader("set-cookie", login.stateCookie);
        response.end();
        return;
      }

      if (request.method === "GET" && url.pathname === "/auth/suap/callback") {
        const code = requiredQueryString(url.searchParams.get("code"), "code");
        const state = requiredQueryString(url.searchParams.get("state"), "state");
        const result = await requireAuthService(authService).completeSuapLogin(
          request,
          code,
          state
        );

        response.setHeader("set-cookie", result.cookies);
        sendJson(response, 200, {
          status: "ok",
          user: {
            userId: result.context.userId,
            displayName: result.context.displayName,
            email: result.context.email,
            campus: result.context.campus
          },
          roles: result.context.roles
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/auth/session") {
        sendJson(response, 200, {
          authenticated: auth.authenticated,
          user: auth.authenticated
            ? {
                userId: auth.userId,
                displayName: auth.displayName,
                email: auth.email,
                campus: auth.campus
              }
            : null,
          roles: auth.roles,
          source: auth.source
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/auth/logout") {
        const cookie = authService
          ? await authService.logout(request)
          : undefined;
        if (cookie) {
          response.setHeader("set-cookie", cookie);
        }
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/users") {
        requirePermission(auth, "admin:manage_users");
        const users = await requireUserStore(userStore).listUsers();
        sendJson(response, 200, {
          count: users.length,
          results: users
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/reservations") {
        requirePermission(auth, "reservation:read");
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
        requirePermission(auth, "reservation:sync");
        const result = await reservationProvider.sync();
        sendJson(response, 200, result);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/reservations/sync/status"
      ) {
        requirePermission(auth, "reservation:sync");
        sendJson(response, 200, {
          scheduler: reservationSyncScheduler?.status() ?? {
            enabled: false,
            running: false
          }
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/keys/availability") {
        requirePermission(auth, "key:read");
        if (!keyAvailabilityService) {
          throw new HttpError(
            503,
            "key_availability_unavailable",
            "Disponibilidade de chaves indisponivel."
          );
        }

        const availability = await keyAvailabilityService.listAvailability(
          parseDateQuery(url.searchParams.get("at"))
        );
        sendJson(response, 200, {
          count: availability.length,
          results: availability
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/key-catalog") {
        requirePermission(auth, "key:read");
        const catalog = requireKeyCatalogStore(keyCatalogStore);
        sendJson(response, 200, await catalog.getCatalog());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/rooms") {
        requirePermission(auth, "key:read");
        const rooms = await requireKeyCatalogStore(keyCatalogStore).listRooms();
        sendJson(response, 200, {
          count: rooms.length,
          results: rooms
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/rooms") {
        requirePermission(auth, "key:manage");
        const room = await requireKeyCatalogStore(keyCatalogStore).createRoom(
          parseCreateRoomInput(await readJsonBody(request))
        );
        sendJson(response, 201, room);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/keys") {
        requirePermission(auth, "key:read");
        const keys = await requireKeyCatalogStore(keyCatalogStore).listKeys();
        sendJson(response, 200, {
          count: keys.length,
          results: keys
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/keys") {
        requirePermission(auth, "key:manage");
        const key = await requireKeyCatalogStore(keyCatalogStore).createKey(
          parseCreateKeyInput(await readJsonBody(request))
        );
        sendJson(response, 201, key);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/key-room-links") {
        requirePermission(auth, "key:read");
        const links = await requireKeyCatalogStore(keyCatalogStore).listLinks();
        sendJson(response, 200, {
          count: links.length,
          results: links
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/key-movements") {
        requirePermission(auth, "key:move");
        const movements = await requireKeyMovementService(
          keyMovementService
        ).list(getKeyMovementQuery(request));
        sendJson(response, 200, {
          count: movements.length,
          results: movements
        });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/key-movements/withdrawals"
      ) {
        requirePermission(auth, "key:move");
        const movement = await requireKeyMovementService(
          keyMovementService
        ).registerWithdrawal(
          parseRegisterKeyWithdrawalInput(await readJsonBody(request))
        );
        sendJson(response, 201, movement);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/key-movements/returns"
      ) {
        requirePermission(auth, "key:move");
        const movement = await requireKeyMovementService(
          keyMovementService
        ).registerReturn(
          parseRegisterKeyReturnInput(await readJsonBody(request))
        );
        sendJson(response, 200, movement);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/key-room-links") {
        requirePermission(auth, "key:manage");
        const link = await requireKeyCatalogStore(keyCatalogStore).createLink(
          parseCreateKeyRoomLinkInput(await readJsonBody(request))
        );
        sendJson(response, 201, link);
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

function getKeyMovementQuery(request: IncomingMessage): KeyMovementListQuery {
  const url = getRequestUrl(request);

  return {
    keyId: url.searchParams.get("keyId") ?? undefined,
    roomId: url.searchParams.get("roomId") ?? undefined,
    status: parseKeyMovementStatus(url.searchParams.get("status"))
  };
}

function parseReservationStatus(
  value: string | null
): ReservationStatus | undefined {
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

function parseDateQuery(value: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(
      400,
      "invalid_date",
      "Parametro 'at' deve ser uma data ISO valida."
    );
  }

  return parsed;
}

function requireKeyCatalogStore(
  keyCatalogStore: KeyCatalogStore | undefined
): KeyCatalogStore {
  if (!keyCatalogStore) {
    throw new HttpError(
      503,
      "key_catalog_unavailable",
      "Catalogo de chaves indisponivel."
    );
  }

  return keyCatalogStore;
}

function requireKeyMovementService(
  keyMovementService: KeyMovementService | undefined
): KeyMovementService {
  if (!keyMovementService) {
    throw new HttpError(
      503,
      "key_movement_unavailable",
      "Movimentacao de chaves indisponivel."
    );
  }

  return keyMovementService;
}

function requireUserStore(userStore: UserStore | undefined): UserStore {
  if (!userStore) {
    throw new HttpError(
      503,
      "user_store_unavailable",
      "Cadastro de usuarios indisponivel."
    );
  }

  return userStore;
}

function requireAuthService(authService: AuthService | undefined): AuthService {
  if (!authService) {
    throw new HttpError(
      503,
      "auth_service_unavailable",
      "Servico de autenticacao indisponivel."
    );
  }

  return authService;
}

function requiredQueryString(value: string | null, field: string): string {
  if (!value?.trim()) {
    throw new HttpError(
      400,
      "invalid_input",
      `Parametro '${field}' e obrigatorio.`
    );
  }

  return value.trim();
}

function parseCreateRoomInput(value: unknown): CreateRoomInput {
  const body = requireObject(value);

  return {
    id: optionalString(body.id),
    name: requiredString(body.name, "name"),
    campus: optionalString(body.campus),
    externalRefs: optionalStringArray(body.externalRefs, "externalRefs")
  };
}

function parseCreateKeyInput(value: unknown): CreateKeyInput {
  const body = requireObject(value);
  const baseStatus = body.baseStatus ?? "disponivel";

  if (!isKeyOperationalStatus(baseStatus)) {
    throw new HttpError(400, "invalid_input", "Estado da chave invalido.");
  }

  return {
    id: optionalString(body.id),
    code: requiredString(body.code, "code"),
    label: optionalString(body.label),
    baseStatus
  };
}

function parseCreateKeyRoomLinkInput(value: unknown): CreateKeyRoomLinkInput {
  const body = requireObject(value);

  return {
    keyId: requiredString(body.keyId, "keyId"),
    roomId: requiredString(body.roomId, "roomId")
  };
}

function parseRegisterKeyWithdrawalInput(value: unknown) {
  const body = requireObject(value);

  return {
    keyId: requiredString(body.keyId, "keyId"),
    roomId: requiredString(body.roomId, "roomId"),
    responsibleName: requiredString(body.responsibleName, "responsibleName"),
    responsibleIdentifier: optionalString(body.responsibleIdentifier),
    actorName: requiredString(body.actorName, "actorName"),
    actorIdentifier: optionalString(body.actorIdentifier),
    occurredAt: optionalString(body.occurredAt),
    notes: optionalString(body.notes)
  };
}

function parseRegisterKeyReturnInput(value: unknown) {
  const body = requireObject(value);

  return {
    keyId: requiredString(body.keyId, "keyId"),
    actorName: requiredString(body.actorName, "actorName"),
    actorIdentifier: optionalString(body.actorIdentifier),
    occurredAt: optionalString(body.occurredAt),
    notes: optionalString(body.notes)
  };
}

function parseKeyMovementStatus(
  value: string | null
): KeyMovementStatus | undefined {
  if (value === "retirada" || value === "devolvida") {
    return value;
  }

  return undefined;
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_input", "Corpo deve ser um objeto JSON.");
  }

  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "invalid_input", `Campo '${field}' e obrigatorio.`);
  }

  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalStringArray(
  value: unknown,
  field: string
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new HttpError(400, "invalid_input", `Campo '${field}' invalido.`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
}
