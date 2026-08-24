import { describe, expect, it } from "vitest";
import { isValidPin } from "../src/people/pin-policy.js";

describe("pin policy", () => {
  it("accepts numeric pins within the configured length range", () => {
    expect(isValidPin("123456", 6, 10)).toBe(true);
    expect(isValidPin("1234567890", 6, 10)).toBe(true);
  });

  it("supports the production policy of exactly eight digits", () => {
    expect(isValidPin("12345678", 8, 8)).toBe(true);
    expect(isValidPin("1234567", 8, 8)).toBe(false);
    expect(isValidPin("123456789", 8, 8)).toBe(false);
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
});
