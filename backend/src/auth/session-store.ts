import { randomBytes } from "node:crypto";
import type { UserRole } from "./types.js";

export interface AuthSession {
  readonly id: string;
  readonly userId: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly campus?: string;
  readonly roles: readonly UserRole[];
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface CreateAuthSessionInput {
  readonly userId: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly campus?: string;
  readonly roles: readonly UserRole[];
  readonly ttlMs: number;
}

export interface AuthSessionStore {
  readonly name: string;
  create(input: CreateAuthSessionInput): Promise<AuthSession>;
  get(sessionId: string, now?: Date): Promise<AuthSession | undefined>;
  delete(sessionId: string): Promise<void>;
  deleteExpired(now?: Date): Promise<number>;
}

export class MemoryAuthSessionStore implements AuthSessionStore {
  readonly name = "memory";
  private readonly sessions = new Map<string, AuthSession>();

  async create(input: CreateAuthSessionInput): Promise<AuthSession> {
    const session = createAuthSessionRecord(input);
    this.sessions.set(session.id, session);
    return session;
  }

  async get(
    sessionId: string,
    now = new Date(),
  ): Promise<AuthSession | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    if (new Date(session.expiresAt).getTime() <= now.getTime()) {
      this.sessions.delete(sessionId);
      return undefined;
    }

    return session;
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async deleteExpired(now = new Date()): Promise<number> {
    let deleted = 0;
    for (const [sessionId, session] of this.sessions) {
      if (new Date(session.expiresAt).getTime() <= now.getTime()) {
        this.sessions.delete(sessionId);
        deleted += 1;
      }
    }

    return deleted;
  }
}

export function createAuthSessionRecord(
  input: CreateAuthSessionInput,
): AuthSession {
  const now = new Date();

  return {
    id: randomBytes(32).toString("base64url"),
    userId: input.userId,
    displayName: input.displayName,
    email: input.email,
    campus: input.campus,
    roles: [...input.roles],
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlMs).toISOString(),
  } satisfies AuthSession;
}
