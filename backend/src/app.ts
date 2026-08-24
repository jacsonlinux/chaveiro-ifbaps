import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AppConfig } from "./config/env.js";
import { publicConfig } from "./config/env.js";
import {
  getAuthContext,
  hasPermission,
  requirePermission,
} from "./auth/auth-context.js";
import type { AuthService } from "./auth/auth-service.js";
import { HttpError, toHttpError } from "./http/errors.js";
import { getRequestUrl, readJsonBody, sendJson } from "./http/json.js";
import type {
  NormalizedReservation,
  ReservationProvider,
  ReservationStatus,
} from "./reservations/types.js";
import type { ReservationSyncScheduler } from "./reservations/reservation-sync-scheduler.js";
import type { ReservationStore } from "./reservations/reservation-store.js";
import type { KeyAvailabilityService } from "./key-control/key-availability.service.js";
import type {
  KeyMovementDateField,
  KeyMovementListQuery,
  KeyMovementRecord,
  KeyMovementStatus,
} from "./key-control/key-movement.store.js";
import type { KeyMovementService } from "./key-control/key-movement.service.js";
import type {
  KeyOccurrenceListQuery,
  KeyOccurrenceOrigin,
  KeyOccurrenceRecord,
  KeyOccurrenceType,
} from "./key-control/key-occurrence.store.js";
import type { KeyOccurrenceService } from "./key-control/key-occurrence.service.js";
import type {
  CreateKeyInput,
  CreateKeyRoomLinkInput,
  CreateRoomInput,
  KeyCatalogStore,
  UpdateKeyInput,
  UpdateRoomInput,
} from "./key-control/key-catalog.store.js";
import { isKeyOperationalStatus } from "./key-control/key-catalog-validation.js";
import type { KeyOperationalStatus } from "./key-control/types.js";
import type { UserListQuery, UserStore } from "./users/user.store.js";
import type { UserRole } from "./auth/types.js";

export function createApp(
  config: AppConfig,
  reservationProvider: ReservationProvider,
  reservationSyncScheduler?: ReservationSyncScheduler,
  keyAvailabilityService?: KeyAvailabilityService,
  keyCatalogStore?: KeyCatalogStore,
  keyMovementService?: KeyMovementService,
  authService?: AuthService,
  userStore?: UserStore,
  keyOccurrenceService?: KeyOccurrenceService,
  reservationStore?: ReservationStore,
): Server {
  return createServer(async (request, response) => {
    try {
      applyCors(config, request, response);
      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        response.end();
        return;
      }

      const url = getRequestUrl(request);
      const auth = authService
        ? await authService.getAuthContext(request)
        : getAuthContext(config, request);

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          status: "ok",
          service: "chaveiro-ifbaps-backend",
          checkedAt: new Date().toISOString(),
          config: publicConfig(config),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/auth/suap/login") {
        if (config.auth.mode !== "session") {
          throw new HttpError(
            404,
            "suap_login_disabled",
            "Login SUAP nao faz parte do modo de autenticacao ativo.",
          );
        }
        const login = requireAuthService(authService).startSuapLogin();
        response.statusCode = 302;
        response.setHeader("location", login.authorizationUrl);
        response.setHeader("set-cookie", login.stateCookie);
        response.end();
        return;
      }

      if (request.method === "GET" && url.pathname === "/auth/suap/callback") {
        if (config.auth.mode !== "session") {
          throw new HttpError(
            404,
            "suap_login_disabled",
            "Login SUAP nao faz parte do modo de autenticacao ativo.",
          );
        }
        const code = requiredQueryString(url.searchParams.get("code"), "code");
        const state = requiredQueryString(
          url.searchParams.get("state"),
          "state",
        );
        const result = await requireAuthService(authService).completeSuapLogin(
          request,
          code,
          state,
        );

        response.setHeader("set-cookie", result.cookies);
        response.statusCode = 302;
        response.setHeader("location", buildFrontendAuthReturnUrl(config));
        response.end();
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
                campus: auth.campus,
              }
            : null,
          roles: auth.roles,
          source: auth.source,
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

      if (
        request.method === "POST" &&
        url.pathname === "/auth/sessions/cleanup"
      ) {
        if (config.auth.mode !== "session") {
          throw new HttpError(
            404,
            "session_cleanup_disabled",
            "Limpeza de sessoes nao faz parte do modo de autenticacao ativo.",
          );
        }
        requirePermission(auth, "admin:manage_users");
        const deleted = await requireAuthService(
          authService,
        ).cleanupExpiredSessions();
        sendJson(response, 200, {
          status: "ok",
          deleted,
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/users") {
        requirePermission(auth, "admin:manage_users");
        const users = await requireUserStore(userStore).listUsers(
          getUserListQuery(request),
        );
        sendJson(response, 200, {
          count: users.length,
          results: users,
        });
        return;
      }

      const userRolesTarget = matchUserRolesPath(url.pathname);
      if (request.method === "PATCH" && userRolesTarget) {
        requirePermission(auth, "admin:manage_users");
        const roles = parseUpdateUserRolesInput(await readJsonBody(request));
        if (
          auth.userId === userRolesTarget.userId &&
          !roles.includes("admin")
        ) {
          throw new HttpError(
            409,
            "cannot_remove_own_admin_role",
            "Administrador nao pode remover o proprio perfil admin.",
          );
        }

        const user = await requireUserStore(userStore).updateUserRoles({
          id: userRolesTarget.userId,
          roles,
          updatedAt: new Date().toISOString(),
          updatedBy: auth.userId,
        });
        sendJson(response, 200, user);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/reservations") {
        requirePermission(auth, "reservation:read");
        const reservations = await reservationProvider.list(
          getReservationQuery(request),
        );
        const results = reservations.map((reservation) =>
          filterReservationForAuth(auth, reservation),
        );
        sendJson(response, 200, {
          provider: reservationProvider.name,
          count: results.length,
          results,
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
            running: false,
          },
        });
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/reservations/sync/events"
      ) {
        requirePermission(auth, "reservation:sync");
        const events = await listReservationSyncEvents(
          requireReservationStore(reservationStore),
          url.searchParams.get("limit"),
        );
        sendJson(response, 200, {
          count: events.length,
          results: events,
        });
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/keys/availability"
      ) {
        requirePermission(auth, "key:read");
        if (!keyAvailabilityService) {
          throw new HttpError(
            503,
            "key_availability_unavailable",
            "Disponibilidade de chaves indisponivel.",
          );
        }

        const availability = await keyAvailabilityService.listAvailability(
          parseDateQuery(url.searchParams.get("at")),
        );
        sendJson(response, 200, {
          count: availability.length,
          results: availability,
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
          results: rooms,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/rooms") {
        requirePermission(auth, "key:manage");
        const room = await requireKeyCatalogStore(keyCatalogStore).createRoom(
          parseCreateRoomInput(await readJsonBody(request)),
        );
        sendJson(response, 201, room);
        return;
      }

      const roomTarget = matchRoomPath(url.pathname);
      if (request.method === "PATCH" && roomTarget) {
        requirePermission(auth, "key:manage");
        const room = await requireKeyCatalogStore(keyCatalogStore).updateRoom(
          parseUpdateRoomInput(
            roomTarget.roomId,
            await readJsonBody(request),
            new Date().toISOString(),
            auth.userId,
          ),
        );
        sendJson(response, 200, room);
        return;
      }

      if (request.method === "DELETE" && roomTarget) {
        requirePermission(auth, "key:manage");
        const room = await requireKeyCatalogStore(keyCatalogStore).disableRoom({
          roomId: roomTarget.roomId,
          disabledAt: new Date().toISOString(),
          disabledBy: auth.userId,
        });
        sendJson(response, 200, room);
        return;
      }

      const roomReactivationTarget = matchRoomReactivationPath(url.pathname);
      if (request.method === "POST" && roomReactivationTarget) {
        requirePermission(auth, "key:manage");
        const room = await requireKeyCatalogStore(
          keyCatalogStore,
        ).reactivateRoom({
          roomId: roomReactivationTarget.roomId,
        });
        sendJson(response, 200, room);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/keys") {
        requirePermission(auth, "key:read");
        const keys = await requireKeyCatalogStore(keyCatalogStore).listKeys();
        sendJson(response, 200, {
          count: keys.length,
          results: keys,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/keys") {
        requirePermission(auth, "key:manage");
        const key = await requireKeyCatalogStore(keyCatalogStore).createKey(
          parseCreateKeyInput(await readJsonBody(request)),
        );
        sendJson(response, 201, key);
        return;
      }

      const keyTarget = matchKeyPath(url.pathname);
      if (request.method === "PATCH" && keyTarget) {
        requirePermission(auth, "key:manage");
        const key = await requireKeyCatalogStore(keyCatalogStore).updateKey(
          parseUpdateKeyInput(
            keyTarget.keyId,
            await readJsonBody(request),
            new Date().toISOString(),
            auth.userId,
          ),
        );
        sendJson(response, 200, key);
        return;
      }

      if (request.method === "DELETE" && keyTarget) {
        requirePermission(auth, "key:manage");
        const key = await requireKeyCatalogStore(keyCatalogStore).disableKey({
          keyId: keyTarget.keyId,
          disabledAt: new Date().toISOString(),
          disabledBy: auth.userId,
        });
        sendJson(response, 200, key);
        return;
      }

      const keyReactivationTarget = matchKeyReactivationPath(url.pathname);
      if (request.method === "POST" && keyReactivationTarget) {
        requirePermission(auth, "key:manage");
        const key = await requireKeyCatalogStore(
          keyCatalogStore,
        ).reactivateKey({
          keyId: keyReactivationTarget.keyId,
        });
        sendJson(response, 200, key);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/key-room-links") {
        requirePermission(auth, "key:read");
        const links = await requireKeyCatalogStore(keyCatalogStore).listLinks();
        sendJson(response, 200, {
          count: links.length,
          results: links,
        });
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/reports/operations"
      ) {
        requirePermission(auth, "key:move");
        const report = await buildOperationalReport(
          requireKeyMovementService(keyMovementService),
          requireKeyOccurrenceService(keyOccurrenceService),
          getOperationalReportQuery(request),
        );
        sendJson(response, 200, report);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/key-movements") {
        requirePermission(auth, "key:move");
        const movements = await requireKeyMovementService(
          keyMovementService,
        ).list(getKeyMovementQuery(request));
        sendJson(response, 200, {
          count: movements.length,
          results: movements,
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/key-occurrences") {
        requirePermission(auth, "key:move");
        const occurrences = await requireKeyOccurrenceService(
          keyOccurrenceService,
        ).list(getKeyOccurrenceQuery(request));
        sendJson(response, 200, {
          count: occurrences.length,
          results: occurrences,
        });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/key-occurrences"
      ) {
        requirePermission(auth, "key:move");
        const input = parseRegisterKeyOccurrenceInput(
          await readJsonBody(request),
        );
        if (input.type === "ajuste_admin") {
          requirePermission(auth, "key:manage");
        }
        const occurrence =
          await requireKeyOccurrenceService(
            keyOccurrenceService,
          ).registerOccurrence(input);
        sendJson(response, 201, occurrence);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/key-movements/withdrawals"
      ) {
        requirePermission(auth, "key:move");
        const movement = await requireKeyMovementService(
          keyMovementService,
        ).registerWithdrawal(
          parseRegisterKeyWithdrawalInput(await readJsonBody(request)),
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
          keyMovementService,
        ).registerReturn(
          parseRegisterKeyReturnInput(await readJsonBody(request)),
        );
        sendJson(response, 200, movement);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/key-room-links") {
        requirePermission(auth, "key:manage");
        const link = await requireKeyCatalogStore(keyCatalogStore).createLink(
          parseCreateKeyRoomLinkInput(await readJsonBody(request)),
        );
        sendJson(response, 201, link);
        return;
      }

      const keyRoomLinkTarget = matchKeyRoomLinkPath(url.pathname);
      if (request.method === "DELETE" && keyRoomLinkTarget) {
        requirePermission(auth, "key:manage");
        const link = await requireKeyCatalogStore(keyCatalogStore).disableLink({
          keyId: keyRoomLinkTarget.keyId,
          roomId: keyRoomLinkTarget.roomId,
          disabledAt: new Date().toISOString(),
          disabledBy: auth.userId,
        });
        sendJson(response, 200, link);
        return;
      }

      const keyRoomLinkReactivationTarget =
        matchKeyRoomLinkReactivationPath(url.pathname);
      if (request.method === "POST" && keyRoomLinkReactivationTarget) {
        requirePermission(auth, "key:manage");
        const link = await requireKeyCatalogStore(
          keyCatalogStore,
        ).reactivateLink({
          keyId: keyRoomLinkReactivationTarget.keyId,
          roomId: keyRoomLinkReactivationTarget.roomId,
        });
        sendJson(response, 200, link);
        return;
      }

      sendJson(response, 404, {
        error: {
          code: "not_found",
          message: "Endpoint nao encontrado.",
        },
      });
    } catch (error) {
      const httpError = toHttpError(error);
      sendJson(response, httpError.statusCode, {
        error: {
          code: httpError.code,
          message: httpError.message,
        },
      });
    }
  });
}

const CORS_ALLOWED_METHODS = "GET,POST,PATCH,DELETE,OPTIONS";
const CORS_ALLOWED_HEADERS =
  "authorization, content-type, x-keychain-user-id, x-keychain-user-name, x-keychain-user-email, x-keychain-user-campus, x-keychain-user-roles";

function applyCors(
  config: AppConfig,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const origin = request.headers.origin;
  if (!origin || !config.cors.allowedOrigins.includes(origin)) {
    return;
  }

  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-credentials", "true");
  response.setHeader("access-control-allow-methods", CORS_ALLOWED_METHODS);
  response.setHeader("access-control-allow-headers", CORS_ALLOWED_HEADERS);
  response.setHeader("vary", appendVary(response.getHeader("vary"), "Origin"));
}

function appendVary(current: string | number[] | string[] | number | undefined, value: string): string {
  const existing = typeof current === "string" ? current : "";
  const values = existing
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
    values.push(value);
  }
  return values.join(", ");
}

function buildFrontendAuthReturnUrl(config: AppConfig): string {
  const url = new URL(config.frontend.baseUrl);
  url.searchParams.set("login", "suap-ok");
  return url.toString();
}

function getReservationQuery(request: IncomingMessage) {
  const url = getRequestUrl(request);

  return {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    roomName: url.searchParams.get("roomName") ?? undefined,
    status: parseReservationStatus(url.searchParams.get("status")),
  };
}

function filterReservationForAuth(
  auth: ReturnType<typeof getAuthContext>,
  reservation: NormalizedReservation,
): NormalizedReservation {
  if (hasPermission(auth, "key:move")) {
    return reservation;
  }

  const {
    responsibleName: _responsibleName,
    responsibleIdentifier: _responsibleIdentifier,
    ...safeReservation
  } = reservation;
  return safeReservation;
}

function matchUserRolesPath(pathname: string): { userId: string } | undefined {
  const match = pathname.match(/^\/api\/users\/([^/]+)\/roles$/);
  const userId = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return userId ? { userId } : undefined;
}

function matchRoomPath(pathname: string): { roomId: string } | undefined {
  const match = pathname.match(/^\/api\/rooms\/([^/]+)$/);
  const roomId = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return roomId ? { roomId } : undefined;
}

function matchRoomReactivationPath(
  pathname: string,
): { roomId: string } | undefined {
  const match = pathname.match(/^\/api\/rooms\/([^/]+)\/reactivate$/);
  const roomId = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return roomId ? { roomId } : undefined;
}

function matchKeyPath(pathname: string): { keyId: string } | undefined {
  const match = pathname.match(/^\/api\/keys\/([^/]+)$/);
  const keyId = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return keyId ? { keyId } : undefined;
}

function matchKeyReactivationPath(
  pathname: string,
): { keyId: string } | undefined {
  const match = pathname.match(/^\/api\/keys\/([^/]+)\/reactivate$/);
  const keyId = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return keyId ? { keyId } : undefined;
}

function matchKeyRoomLinkPath(
  pathname: string,
): { keyId: string; roomId: string } | undefined {
  const match = pathname.match(/^\/api\/key-room-links\/([^/]+)\/([^/]+)$/);
  const keyId = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  const roomId = match?.[2] ? decodeURIComponent(match[2]) : undefined;
  return keyId && roomId ? { keyId, roomId } : undefined;
}

function matchKeyRoomLinkReactivationPath(
  pathname: string,
): { keyId: string; roomId: string } | undefined {
  const match = pathname.match(
    /^\/api\/key-room-links\/([^/]+)\/([^/]+)\/reactivate$/,
  );
  const keyId = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  const roomId = match?.[2] ? decodeURIComponent(match[2]) : undefined;
  return keyId && roomId ? { keyId, roomId } : undefined;
}

function getKeyMovementQuery(request: IncomingMessage): KeyMovementListQuery {
  const url = getRequestUrl(request);

  return {
    keyId: url.searchParams.get("keyId") ?? undefined,
    roomId: url.searchParams.get("roomId") ?? undefined,
    status: parseKeyMovementStatus(url.searchParams.get("status")),
    dateField: parseKeyMovementDateField(url.searchParams.get("dateField")),
    from: parseOptionalDateQuery(url.searchParams.get("from"), "from"),
    to: parseOptionalDateQuery(url.searchParams.get("to"), "to"),
  };
}

function getUserListQuery(request: IncomingMessage): UserListQuery {
  const url = getRequestUrl(request);

  return {
    search: url.searchParams.get("search")?.trim() || undefined,
    role: parseUserRole(url.searchParams.get("role")),
  };
}

function getKeyOccurrenceQuery(
  request: IncomingMessage,
): KeyOccurrenceListQuery {
  const url = getRequestUrl(request);

  return {
    keyId: url.searchParams.get("keyId") ?? undefined,
    roomId: url.searchParams.get("roomId") ?? undefined,
    type: parseKeyOccurrenceType(url.searchParams.get("type")),
    from: parseOptionalDateQuery(url.searchParams.get("from"), "from"),
    to: parseOptionalDateQuery(url.searchParams.get("to"), "to"),
  };
}

interface OperationalReportQuery {
  readonly from?: string;
  readonly to?: string;
}

async function buildOperationalReport(
  keyMovementService: KeyMovementService,
  keyOccurrenceService: KeyOccurrenceService,
  query: OperationalReportQuery,
) {
  const [movements, occurrences] = await Promise.all([
    keyMovementService.list({}),
    keyOccurrenceService.list({}),
  ]);
  const withdrawals = movements.filter((movement) =>
    dateInRange(movement.checkedOutAt, query),
  );
  const returns = movements.filter(
    (movement) => movement.returnedAt && dateInRange(movement.returnedAt, query),
  );
  const periodOccurrences = occurrences.filter((occurrence) =>
    dateInRange(occurrence.occurredAt, query),
  );

  return {
    generatedAt: new Date().toISOString(),
    period: query,
    movements: summarizeMovements(movements, withdrawals, returns),
    occurrences: summarizeOccurrences(periodOccurrences),
  };
}

function getOperationalReportQuery(
  request: IncomingMessage,
): OperationalReportQuery {
  const url = getRequestUrl(request);

  return {
    from: parseOptionalDateQuery(url.searchParams.get("from"), "from"),
    to: parseOptionalDateQuery(url.searchParams.get("to"), "to"),
  };
}

function summarizeMovements(
  allMovements: readonly KeyMovementRecord[],
  withdrawals: readonly KeyMovementRecord[],
  returns: readonly KeyMovementRecord[],
) {
  return {
    withdrawals: withdrawals.length,
    returns: returns.length,
    open: allMovements.filter((movement) => movement.status === "retirada")
      .length,
  };
}

function summarizeOccurrences(
  occurrences: readonly KeyOccurrenceRecord[],
) {
  return {
    total: occurrences.length,
    operational: occurrences.filter((occurrence) => occurrence.type === "ocorrencia")
      .length,
    adminAdjustments: occurrences.filter(
      (occurrence) => occurrence.type === "ajuste_admin",
    ).length,
  };
}

function dateInRange(
  value: string,
  query: OperationalReportQuery,
): boolean {
  return (!query.from || value >= query.from) && (!query.to || value <= query.to);
}

function parseReservationStatus(
  value: string | null,
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
      "Parametro 'at' deve ser uma data ISO valida.",
    );
  }

  return parsed;
}

function parseOptionalDateQuery(
  value: string | null,
  field: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(
      400,
      "invalid_date",
      `Parametro '${field}' deve ser uma data ISO valida.`,
    );
  }

  return parsed.toISOString();
}

function requireKeyCatalogStore(
  keyCatalogStore: KeyCatalogStore | undefined,
): KeyCatalogStore {
  if (!keyCatalogStore) {
    throw new HttpError(
      503,
      "key_catalog_unavailable",
      "Catalogo de chaves indisponivel.",
    );
  }

  return keyCatalogStore;
}

function requireKeyMovementService(
  keyMovementService: KeyMovementService | undefined,
): KeyMovementService {
  if (!keyMovementService) {
    throw new HttpError(
      503,
      "key_movement_unavailable",
      "Movimentacao de chaves indisponivel.",
    );
  }

  return keyMovementService;
}

function requireKeyOccurrenceService(
  keyOccurrenceService: KeyOccurrenceService | undefined,
): KeyOccurrenceService {
  if (!keyOccurrenceService) {
    throw new HttpError(
      503,
      "key_occurrence_unavailable",
      "Registro de ocorrencias indisponivel.",
    );
  }

  return keyOccurrenceService;
}

function requireUserStore(userStore: UserStore | undefined): UserStore {
  if (!userStore) {
    throw new HttpError(
      503,
      "user_store_unavailable",
      "Cadastro de usuarios indisponivel.",
    );
  }

  return userStore;
}

function requireReservationStore(
  reservationStore: ReservationStore | undefined,
): ReservationStore {
  if (!reservationStore) {
    throw new HttpError(
      503,
      "reservation_store_unavailable",
      "Store de reservas indisponivel.",
    );
  }

  return reservationStore;
}

async function listReservationSyncEvents(
  reservationStore: ReservationStore,
  rawLimit: string | null,
) {
  if (!reservationStore.listSyncEvents) {
    return [];
  }

  return reservationStore.listSyncEvents(parseSyncEventLimit(rawLimit));
}

function parseSyncEventLimit(value: string | null): number {
  if (!value) {
    return 10;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new HttpError(
      400,
      "invalid_limit",
      "Parametro 'limit' deve ser um inteiro entre 1 e 50.",
    );
  }

  return parsed;
}

function requireAuthService(authService: AuthService | undefined): AuthService {
  if (!authService) {
    throw new HttpError(
      503,
      "auth_service_unavailable",
      "Servico de autenticacao indisponivel.",
    );
  }

  return authService;
}

function requiredQueryString(value: string | null, field: string): string {
  if (!value?.trim()) {
    throw new HttpError(
      400,
      "invalid_input",
      `Parametro '${field}' e obrigatorio.`,
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
    externalRefs: optionalStringArray(body.externalRefs, "externalRefs"),
  };
}

function parseCreateKeyInput(value: unknown): CreateKeyInput {
  const body = requireObject(value);

  return {
    id: optionalString(body.id),
    code: requiredString(body.code, "code"),
    label: optionalString(body.label),
    baseStatus: optionalEditableKeyBaseStatus(body.baseStatus) ?? "disponivel",
  };
}

function parseUpdateRoomInput(
  roomId: string,
  value: unknown,
  updatedAt: string,
  updatedBy: string | undefined,
): UpdateRoomInput {
  const body = requireObject(value);

  return {
    roomId,
    name: optionalString(body.name),
    campus: optionalString(body.campus),
    externalRefs: optionalStringArray(body.externalRefs, "externalRefs"),
    updatedAt,
    updatedBy,
  };
}

function parseUpdateKeyInput(
  keyId: string,
  value: unknown,
  updatedAt: string,
  updatedBy: string | undefined,
): UpdateKeyInput {
  const body = requireObject(value);

  return {
    keyId,
    code: optionalString(body.code),
    label: optionalString(body.label),
    baseStatus: optionalEditableKeyBaseStatus(body.baseStatus),
    updatedAt,
    updatedBy,
  };
}

function parseCreateKeyRoomLinkInput(value: unknown): CreateKeyRoomLinkInput {
  const body = requireObject(value);

  return {
    keyId: requiredString(body.keyId, "keyId"),
    roomId: requiredString(body.roomId, "roomId"),
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
    notes: optionalString(body.notes),
  };
}

function parseRegisterKeyReturnInput(value: unknown) {
  const body = requireObject(value);

  return {
    keyId: requiredString(body.keyId, "keyId"),
    actorName: requiredString(body.actorName, "actorName"),
    actorIdentifier: optionalString(body.actorIdentifier),
    occurredAt: optionalString(body.occurredAt),
    notes: optionalString(body.notes),
  };
}

function parseRegisterKeyOccurrenceInput(value: unknown) {
  const body = requireObject(value);

  return {
    keyId: requiredString(body.keyId, "keyId"),
    roomId: optionalString(body.roomId),
    type: requiredKeyOccurrenceType(body.type),
    origin: optionalKeyOccurrenceOrigin(body.origin),
    targetStatus: optionalKeyOperationalStatus(body.targetStatus),
    actorName: requiredString(body.actorName, "actorName"),
    actorIdentifier: optionalString(body.actorIdentifier),
    occurredAt: optionalString(body.occurredAt),
    notes: requiredString(body.notes, "notes"),
  };
}

function parseUpdateUserRolesInput(value: unknown): readonly UserRole[] {
  const body = requireObject(value);
  const roles = body.roles;

  if (!Array.isArray(roles)) {
    throw new HttpError(400, "invalid_input", "Campo 'roles' deve ser lista.");
  }

  const normalized = new Set<UserRole>(["usuario"]);
  for (const role of roles) {
    if (!isUserRole(role)) {
      throw new HttpError(400, "invalid_input", "Perfil de usuario invalido.");
    }
    normalized.add(role);
  }

  return [...normalized];
}

function isUserRole(value: unknown): value is UserRole {
  return value === "usuario" || value === "portaria" || value === "admin";
}

function parseUserRole(value: string | null): UserRole | undefined {
  return isUserRole(value) ? value : undefined;
}

function parseKeyMovementStatus(
  value: string | null,
): KeyMovementStatus | undefined {
  if (value === "retirada" || value === "devolvida") {
    return value;
  }

  return undefined;
}

function parseKeyMovementDateField(
  value: string | null,
): KeyMovementDateField | undefined {
  if (value === "checkedOutAt" || value === "returnedAt") {
    return value;
  }

  return undefined;
}

function parseKeyOccurrenceType(
  value: string | null,
): KeyOccurrenceType | undefined {
  if (value === "ocorrencia" || value === "ajuste_admin") {
    return value;
  }

  return undefined;
}

function requiredKeyOccurrenceType(value: unknown): KeyOccurrenceType {
  if (value === "ocorrencia" || value === "ajuste_admin") {
    return value;
  }

  throw new HttpError(400, "invalid_input", "Tipo de ocorrencia invalido.");
}

function optionalKeyOccurrenceOrigin(value: unknown): KeyOccurrenceOrigin {
  if (value === undefined) {
    return "portaria";
  }

  if (value === "portaria" || value === "admin") {
    return value;
  }

  throw new HttpError(400, "invalid_input", "Origem da ocorrencia invalida.");
}

function optionalKeyOperationalStatus(
  value: unknown,
): KeyOperationalStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isKeyOperationalStatus(value)) {
    throw new HttpError(400, "invalid_input", "Estado da chave invalido.");
  }

  return value;
}

function optionalEditableKeyBaseStatus(
  value: unknown,
): KeyOperationalStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === "disponivel" ||
    value === "em_manutencao" ||
    value === "perdida" ||
    value === "danificada"
  ) {
    return value;
  }

  if (!isKeyOperationalStatus(value)) {
    throw new HttpError(400, "invalid_input", "Estado da chave invalido.");
  }

  throw new HttpError(
    400,
    "invalid_input",
    "Estado base da chave deve ser operacional manual.",
  );
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_input", "Corpo deve ser um objeto JSON.");
  }

  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(
      400,
      "invalid_input",
      `Campo '${field}' e obrigatorio.`,
    );
  }

  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalStringArray(
  value: unknown,
  field: string,
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new HttpError(400, "invalid_input", `Campo '${field}' invalido.`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
}
