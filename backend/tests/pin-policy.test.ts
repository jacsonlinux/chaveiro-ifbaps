import { describe, expect, it } from "vitest";
import {
  isLocked,
  isValidPin,
  registerFailure,
  registerSuccess,
} from "../src/people/pin-policy.js";

describe("pin policy", () => {
  it("accepts numeric pins within the configured length range", () => {
    expect(isValidPin("123456", 6, 10)).toBe(true);
    expect(isValidPin("1234567890", 6, 10)).toBe(true);
  });

  it("supports the production policy of exactly six digits", () => {
    expect(isValidPin("123456", 6, 6)).toBe(true);
    expect(isValidPin("12345", 6, 6)).toBe(false);
    expect(isValidPin("1234567", 6, 6)).toBe(false);
  });

  it("rejects short, long, empty and non-numeric values", () => {
    expect(isValidPin("12345", 6, 10)).toBe(false);
    expect(isValidPin("12345678901", 6, 10)).toBe(false);
    expect(isValidPin("", 6, 10)).toBe(false);
    expect(isValidPin("abcdef", 6, 10)).toBe(false);
    expect(isValidPin("12345a", 6, 10)).toBe(false);
    expect(isValidPin(123456, 6, 10)).toBe(false);
    expect(isValidPin(undefined, 6, 10)).toBe(false);
  });

  it("locks only after the configured attempt window", () => {
    const first = registerFailure(undefined, 1_000, 3, 60_000);
    expect(first).toMatchObject({ count: 1, lockedUntil: null });

    const second = registerFailure(first, 2_000, 3, 60_000);
    expect(second).toMatchObject({ count: 2, lockedUntil: null });

    const third = registerFailure(second, 3_000, 3, 60_000);
    expect(third.count).toBe(0);
    expect(isLocked(third, 3_000)).toBe(true);
    expect(isLocked(third, 63_000)).toBe(false);
  });

  it("resets the counter after a stale window", () => {
    const first = registerFailure(undefined, 1_000, 3, 60_000);
    const stale = registerFailure(first, 120_000, 3, 60_000);
    expect(stale).toMatchObject({ count: 1, lockedUntil: null });
  });

  it("success clears the record", () => {
    expect(registerSuccess()).toMatchObject({
      count: 0,
      lastFailedAt: null,
      lockedUntil: null,
    });
  });
});
