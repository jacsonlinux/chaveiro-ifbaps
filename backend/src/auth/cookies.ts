import type { IncomingMessage } from "node:http";

export interface CookieOptions {
  readonly httpOnly?: boolean;
  readonly maxAgeSeconds?: number;
  readonly path?: string;
  readonly sameSite?: "Lax" | "Strict" | "None";
  readonly secure?: boolean;
}

export function parseCookies(request: IncomingMessage): Record<string, string> {
  const header = request.headers.cookie;
  if (!header) {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }

    cookies[name] = decodeURIComponent(value);
  }

  return cookies;
}

export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? "/"}`,
    `SameSite=${options.sameSite ?? "Lax"}`
  ];

  if (options.httpOnly ?? true) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${options.maxAgeSeconds}`);
  }

  return parts.join("; ");
}

export function expiredCookie(name: string, secure: boolean): string {
  return serializeCookie(name, "", {
    maxAgeSeconds: 0,
    path: "/",
    sameSite: "Lax",
    secure
  });
}
