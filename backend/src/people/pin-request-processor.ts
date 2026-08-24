import bcrypt from "bcryptjs";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  randomBytes,
  randomInt,
} from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  type CollectionReference,
  type DocumentData,
  type Firestore,
  FieldValue,
} from "firebase-admin/firestore";
import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";
import {
  isValidPin,
} from "./pin-policy.js";

const BCRYPT_ROUNDS = 12;

interface PinRequestRecord extends DocumentData {
  readonly uid: string;
  readonly personId?: string;
  readonly operation: "generate_pin" | "reveal_pin" | "verify_pin";
  readonly status: "pending" | "processing" | "completed" | "failed";
  readonly pin?: string;
  readonly publicKey?: string;
  readonly createdAt: string;
}

interface PinGenerationEnvelope {
  readonly algorithm: "ECDH-P256/AES-256-GCM";
  readonly ciphertext: string;
  readonly iv: string;
  readonly ephemeralPublicKey: string;
}

export class PinRequestProcessor {
  readonly name = "pin-requests";
  private readonly db: Firestore;
  private readonly requests: CollectionReference<DocumentData>;
  private readonly people: CollectionReference<DocumentData>;
  private readonly fingerprints: CollectionReference<DocumentData>;
  private readonly fingerprintSecret?: string;
  private readonly vaultSecret?: string;
  private readonly minDigits: number;
  private readonly maxDigits: number;
  private readonly requestTtlMs: number;
  private readonly sweepIntervalMs: number;
  private unsubscribe: (() => void) | undefined;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;
  private readonly processing = new Set<string>();

  constructor(config: AppConfig) {
    const serviceAccountPath = config.firebaseRuntime.serviceAccountPath;
    if (!serviceAccountPath) {
      throw new HttpError(
        503,
        "firebase_service_account_not_configured",
        "Service account do Firebase nao configurada.",
      );
    }

    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert(serviceAccountPath),
      });
    this.db = getFirestore(app);
    this.requests = this.db.collection(config.pinControl.requestsCollection);
    this.people = this.db.collection(config.pinControl.peopleCollection);
    this.fingerprints = this.db.collection(
      config.pinControl.fingerprintsCollection,
    );
    this.fingerprintSecret = config.pinControl.fingerprintSecret;
    this.vaultSecret = config.pinControl.vaultSecret;
    this.minDigits = config.pinControl.minDigits;
    this.maxDigits = config.pinControl.maxDigits;
    this.requestTtlMs = config.pinControl.requestTtlMs;
    this.sweepIntervalMs = config.pinControl.sweepIntervalMs;
  }

  start(): void {
    this.unsubscribe = this.requests
      .where("status", "==", "pending")
      .onSnapshot(
        (snapshot) => {
          for (const doc of snapshot.docs) {
            void this.processRequest(doc.id, doc.data() as PinRequestRecord);
          }
        },
        (error) => {
          console.error("pin_requests listener error:", error.message);
        },
      );

    this.sweepTimer = setInterval(() => {
      void this.sweepExpired();
    }, this.sweepIntervalMs);
  }

  stop(): void {
    this.unsubscribe?.();
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
  }

  async runOnceForTesting(
    id: string,
    data: PinRequestRecord,
  ): Promise<void> {
    await this.processRequest(id, data);
  }

  private async processRequest(
    id: string,
    data: PinRequestRecord,
  ): Promise<void> {
    if (this.processing.has(id)) {
      return;
    }
    this.processing.add(id);

    try {
      const claimed = await this.claimRequest(id);
      if (!claimed) {
        return;
      }
      if (claimed.operation === "generate_pin") {
        await this.processGeneratePin(id, claimed);
        return;
      }
      if (claimed.operation === "reveal_pin") {
        await this.processRevealPin(id, claimed);
        return;
      }
      if (claimed.operation === "verify_pin") {
        await this.processVerifyPin(id, claimed);
        return;
      }
      await this.finish(id, {
        status: "failed",
        failReason: "invalid_operation",
      });
    } catch (error) {
      await this.finish(id, {
        status: "failed",
        failReason:
          error instanceof Error ? error.message : "internal_error",
      });
    } finally {
      this.processing.delete(id);
    }
  }

  private async claimRequest(id: string): Promise<PinRequestRecord | undefined> {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.requests.doc(id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.status !== "pending") {
        return undefined;
      }

      const claimed = snapshot.data() as PinRequestRecord;
      transaction.update(ref, {
        status: "processing",
        processedAt: new Date().toISOString(),
      });
      return claimed;
    });
  }

  private async processGeneratePin(
    id: string,
    data: PinRequestRecord,
  ): Promise<void> {
    const personId = data.personId;
    if (!personId || !data.publicKey || !this.fingerprintSecret || !this.vaultSecret) {
      await this.finish(id, {
        status: "failed",
        failReason: this.fingerprintSecret && this.vaultSecret
          ? "invalid_pin_generation_request"
          : "pin_generation_not_configured",
      });
      return;
    }

    const person = await this.people.doc(personId).get();
    if (!person.exists || person.data()?.active === false) {
      await this.finish(id, {
        status: "failed",
        failReason: "person_not_found",
      });
      return;
    }

    try {
      assertClientPublicKey(data.publicKey);
    } catch {
      await this.finish(id, {
        status: "failed",
        failReason: "invalid_client_key",
      });
      return;
    }

    let generated: { pin: string; generatedAt: string };
    try {
      generated = await this.generateUniquePin(personId);
    } catch (error) {
      await this.finish(id, {
        status: "failed",
        failReason:
          error instanceof Error ? error.message : "pin_generation_failed",
      });
      return;
    }

    let pinEnvelope: PinGenerationEnvelope;
    try {
      pinEnvelope = encryptPinForClient(generated.pin, data.publicKey);
    } catch {
      await this.finish(id, {
        status: "failed",
        failReason: "invalid_client_key",
      });
      return;
    }

    await this.requests.doc(id).update({
      status: "completed",
      result: {
        ok: true,
        personId,
        generatedAt: generated.generatedAt,
      },
      pinEnvelope,
      processedAt: new Date().toISOString(),
      publicKey: FieldValue.delete(),
    });

    console.log(
      JSON.stringify({
        event: "pin_generated",
        requestId: id,
        personId,
        at: generated.generatedAt,
      }),
    );
  }

  private async generateUniquePin(
    personId: string,
  ): Promise<{ pin: string; generatedAt: string }> {
    if (!this.fingerprintSecret) {
      throw new Error("pin_generation_not_configured");
    }

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const pin = String(randomInt(0, 100_000_000)).padStart(8, "0");
      const fingerprint = createHmac("sha256", this.fingerprintSecret)
        .update(pin)
        .digest("hex");
      const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
      const generatedAt = new Date().toISOString();
      const reserved = await this.db.runTransaction(async (transaction) => {
        const personRef = this.people.doc(personId);
        const fingerprintRef = this.fingerprints.doc(fingerprint);
        const personSnapshot = await transaction.get(personRef);
        if (!personSnapshot.exists || personSnapshot.data()?.active === false) {
          throw new Error("person_not_found");
        }
        const fingerprintSnapshot = await transaction.get(fingerprintRef);
        const ownerId = fingerprintSnapshot.data()?.personId;
        if (ownerId && ownerId !== personId) {
          return false;
        }

        const previousFingerprint = personSnapshot.data()?.pinFingerprint;
        if (previousFingerprint && previousFingerprint !== fingerprint) {
          transaction.delete(this.fingerprints.doc(previousFingerprint));
        }
        transaction.set(fingerprintRef, {
          personId,
          updatedAt: generatedAt,
        });
        transaction.update(personRef, {
          pinHash,
          pinFingerprint: fingerprint,
          pinCiphertext: encryptPinAtRest(pin, this.vaultSecret!),
          pinUpdatedAt: generatedAt,
          pinGeneratedAt: generatedAt,
        });
        return true;
      });

      if (reserved) {
        return { pin, generatedAt };
      }
    }

    throw new Error("pin_generation_collision");
  }

  private async processRevealPin(
    id: string,
    data: PinRequestRecord,
  ): Promise<void> {
    const personId = data.personId;
    if (!personId || !data.publicKey || !this.vaultSecret) {
      await this.finish(id, {
        status: "failed",
        failReason: this.vaultSecret
          ? "invalid_pin_reveal_request"
          : "pin_generation_not_configured",
      });
      return;
    }

    let pin: string;
    try {
      assertClientPublicKey(data.publicKey);
      const person = await this.people.doc(personId).get();
      const encryptedPin = person.data()?.pinCiphertext;
      if (!person.exists || person.data()?.active === false || typeof encryptedPin !== "string") {
        throw new Error("pin_not_persisted");
      }
      pin = decryptPinAtRest(encryptedPin, this.vaultSecret);
      if (!isValidPin(pin, this.minDigits, this.maxDigits)) {
        throw new Error("pin_ciphertext_invalid");
      }
    } catch (error) {
      await this.finish(id, {
        status: "failed",
        failReason: error instanceof Error ? error.message : "pin_reveal_failed",
      });
      return;
    }

    await this.requests.doc(id).update({
      status: "completed",
      result: { ok: true, personId },
      pinEnvelope: encryptPinForClient(pin, data.publicKey),
      processedAt: new Date().toISOString(),
      publicKey: FieldValue.delete(),
    });
  }

  private async processVerifyPin(
    id: string,
    data: PinRequestRecord,
  ): Promise<void> {
    const uid = data.uid;
    if (!uid || !isValidPin(data.pin, this.minDigits, this.maxDigits)) {
      await this.finish(id, {
        status: "failed",
        failReason: "invalid_pin_policy",
      });
      return;
    }

    const people = (await this.people.get()).docs;
    for (const candidate of people) {
      const personData = candidate.data();
      if (typeof personData.pinHash !== "string") {
        continue;
      }
      if (personData.active === false) {
        continue;
      }
      let matches = false;
      try {
        matches = await bcrypt.compare(data.pin!, personData.pinHash);
      } catch {
        continue;
      }
      if (!matches) {
        continue;
      }

      await this.finish(id, {
        status: "completed",
        result: {
          valid: true,
          personId: candidate.id,
          name: personData.name,
          cargo: personData.cargo,
          matricula: personData.matricula,
        },
        pin: FieldValue.delete(),
      });
      return;
    }

    await this.finish(id, {
      status: "failed",
      failReason: "invalid_pin",
      result: { valid: false },
    });
  }

  private async finish(
    id: string,
    patch: DocumentData,
  ): Promise<void> {
    const update: DocumentData = {
      ...patch,
      processedAt: new Date().toISOString(),
    };
    if (!("pin" in update)) {
      update.pin = FieldValue.delete();
    }
    update.publicKey = FieldValue.delete();
    await this.requests.doc(id).update(update);
  }

  private async sweepExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - this.requestTtlMs).toISOString();
    const pending = await this.requests
      .where("status", "in", ["pending", "processing"])
      .get();
    for (const doc of pending.docs) {
      const data = doc.data() as PinRequestRecord;
      if (data.createdAt < cutoff) {
        await this.finish(doc.id, {
          status: "failed",
          failReason: "request_expired",
        });
      }
    }

    const completed = await this.requests
      .where("status", "in", ["completed", "failed"])
      .get();
    for (const doc of completed.docs) {
      const data = doc.data() as PinRequestRecord;
      if (data.createdAt < cutoff) {
        await doc.ref.delete();
      }
    }
  }
}

export function createPinRequestProcessor(config: AppConfig): PinRequestProcessor {
  return new PinRequestProcessor(config);
}

export function encryptPinForClient(
  pin: string,
  clientPublicKey: string,
): PinGenerationEnvelope {
  const clientKey = createPublicKey({
    key: Buffer.from(clientPublicKey, "base64url"),
    format: "der",
    type: "spki",
  });
  const ephemeral = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const sharedSecret = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: clientKey,
  });
  const encryptionKey = createHash("sha256").update(sharedSecret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(pin, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  return {
    algorithm: "ECDH-P256/AES-256-GCM",
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    ephemeralPublicKey: ephemeral.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64url"),
  };
}

function assertClientPublicKey(clientPublicKey: string): void {
  createPublicKey({
    key: Buffer.from(clientPublicKey, "base64url"),
    format: "der",
    type: "spki",
  });
}

export function encryptPinAtRest(pin: string, secret: string): string {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(pin, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return [iv.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptPinAtRest(value: string, secret: string): string {
  const [ivValue, ciphertextValue] = value.split(".");
  if (!ivValue || !ciphertextValue) {
    throw new Error("pin_ciphertext_invalid");
  }
  const key = createHash("sha256").update(secret).digest();
  const iv = Buffer.from(ivValue, "base64url");
  const ciphertext = Buffer.from(ciphertextValue, "base64url");
  if (iv.length !== 12 || ciphertext.length < 16) {
    throw new Error("pin_ciphertext_invalid");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(ciphertext.subarray(-16));
  return Buffer.concat([
    decipher.update(ciphertext.subarray(0, -16)),
    decipher.final(),
  ]).toString("utf8");
}
