export type UserRole = "usuario" | "portaria" | "admin";

export interface AuthContext {
  readonly authenticated: boolean;
  readonly userId?: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly campus?: string;
  readonly roles: readonly UserRole[];
  readonly source: "disabled" | "trusted-header" | "session";
}

export type Permission =
  | "reservation:read"
  | "reservation:sync"
  | "key:read"
  | "key:manage"
  | "key:move"
  | "admin:manage_users";
