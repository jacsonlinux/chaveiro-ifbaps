export interface PinAttemptRecord {
  readonly count: number;
  readonly lastFailedAt: string | null;
  readonly lockedUntil: string | null;
}

export function isValidPin(
  value: unknown,
  minDigits: number,
  maxDigits: number,
): boolean {
  if (typeof value !== "string" || !value) {
    return false;
  }

  if (value.length < minDigits || value.length > maxDigits) {
    return false;
  }

  return /^\d+$/.test(value);
}

export function isLocked(record: PinAttemptRecord | undefined, nowMs: number): boolean {
  return Boolean(record?.lockedUntil && Date.parse(record.lockedUntil) > nowMs);
}

export function registerFailure(
  previous: PinAttemptRecord | undefined,
  nowMs: number,
  maxAttempts: number,
  lockoutMs: number,
): PinAttemptRecord {
  const stale =
    !previous?.lastFailedAt ||
    nowMs - Date.parse(previous.lastFailedAt) > lockoutMs;
  const count = stale ? 1 : (previous?.count ?? 0) + 1;
  const lastFailedAt = new Date(nowMs).toISOString();

  if (count >= maxAttempts) {
    return {
      count: 0,
      lastFailedAt,
      lockedUntil: new Date(nowMs + lockoutMs).toISOString(),
    };
  }

  return {
    count,
    lastFailedAt,
    lockedUntil: null,
  };
}

export function registerSuccess(): PinAttemptRecord {
  return {
    count: 0,
    lastFailedAt: null,
    lockedUntil: null,
  };
}