import {
  createDecipheriv,
  createHash,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptPinAtRest,
  encryptPinAtRest,
  encryptPinForClient,
} from "../src/people/pin-request-processor.js";

describe("pin generation envelope", () => {
  it("can be opened only with the ephemeral browser private key", () => {
    const browser = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const browserPublicKey = browser.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64url");
    const envelope = encryptPinForClient("01234567", browserPublicKey);

    const ephemeralPublicKey = requirePublicKey(envelope.ephemeralPublicKey);
    const sharedSecret = diffieHellman({
      privateKey: browser.privateKey,
      publicKey: ephemeralPublicKey,
    });
    const key = createHash("sha256").update(sharedSecret).digest();
    const ciphertext = Buffer.from(envelope.ciphertext, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.iv, "base64url"),
    );
    decipher.setAuthTag(ciphertext.subarray(-16));
    const plaintext = Buffer.concat([
      decipher.update(ciphertext.subarray(0, -16)),
      decipher.final(),
    ]).toString("utf8");

    expect(envelope.algorithm).toBe("ECDH-P256/AES-256-GCM");
    expect(plaintext).toBe("01234567");
  });
});

describe("pin vault encryption", () => {
  it("round-trips the permanent PIN without storing plaintext", () => {
    const ciphertext = encryptPinAtRest("01234567", "test-vault-secret");

    expect(ciphertext).not.toContain("01234567");
    expect(decryptPinAtRest(ciphertext, "test-vault-secret")).toBe("01234567");
    expect(() => decryptPinAtRest(ciphertext, "another-secret")).toThrow();
  });

  it("rejects malformed vault values", () => {
    expect(() => decryptPinAtRest("invalid", "test-vault-secret")).toThrow(
      "pin_ciphertext_invalid",
    );
  });
});

function requirePublicKey(value: string) {
  return createPublicKey({
    key: Buffer.from(value, "base64url"),
    format: "der",
    type: "spki",
  });
}
