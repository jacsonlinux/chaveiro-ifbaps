import type { IncomingMessage } from "node:http";
import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";
import type { AuthContext, Permission, UserRole } from "./types.js";

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  usuario: ["reservation:read", "key:read"],
  portaria: ["reservation:read", "key:read", "key:move"],
  admin: ["reservation:read", "reservation:sync", "key:read", "key:manage", "key:move"]
};

export function getAuthContext(
  config: AppConfig,
  request: IncomingMessage
): AuthContext {
  if (config.auth.mode === "disabled") {
    return {
      authenticated: true,
      userId: "auth-disabled",
      displayName: "Auth Disabled",
      roles: ["admin"],
      source: "disabled"
    };
  }

  if (config.auth.mode === "session") {
    return {
      authenticated: false,
      roles: [],
      source: "session"
    };
  }

  const userId = readHeader(request, "x-keychain-user-id");
  const roles = parseRoles(readHeader(request, "x-keychain-user-roles"));

  if (!userId || roles.length === 0) {
    return {
      authenticated: false,
      roles: [],
      source: "trusted-header"
    };
  }

  return {
    authenticated: true,
    userId,
    displayName: readHeader(request, "x-keychain-user-name"),
    email: readHeader(request, "x-keychain-user-email"),
    roles,
    source: "trusted-header"
  };
}

export function requirePermission(
  context: AuthContext,
  permission: Permission
): AuthContext {
  if (!context.authenticated) {
    throw new HttpError(
      401,
      "authentication_required",
      "Autenticacao obrigatoria."
    );
  }

  if (!hasPermission(context, permission)) {
    throw new HttpError(
      403,
      "permission_denied",
      "Permissao insuficiente."
    );
  }

  return context;
}

export function hasPermission(
  context: AuthContext,
  permission: Permission
): boolean {
  return context.roles.some((role) =>
    ROLE_PERMISSIONS[role].includes(permission)
  );
}

function readHeader(
  request: IncomingMessage,
  name: string
): string | undefined {
  const value = request.headers[name];

  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }

  return value?.trim() || undefined;
}

function parseRoles(value: string | undefined): readonly UserRole[] {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((role) => role.trim())
    .filter(isUserRole);
}

function isUserRole(value: string): value is UserRole {
  return value === "usuario" || value === "portaria" || value === "admin";
}
