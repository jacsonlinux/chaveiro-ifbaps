import bcrypt from "bcryptjs";
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
  isLocked,
  isValidPin,
  registerFailure,
  registerSuccess,
  type PinAttemptRecord,
} from "./pin-policy.js";

const BCRYPT_ROUNDS = 12;

interface PinRequestRecord extends DocumentData {
  readonly uid: string;
  readonly personId?: string;
  readonly operation: "set_pin" | "verify_pin";
  readonly status: "pending" | "processing" | "completed" | "failed";
  readonly pin?: string;
  readonly createdAt: string;
}

export class PinRequestProcessor {
  readonly name = "pin-requests";
  private readonly db: Firestore;
  private readonly requests: CollectionReference<DocumentData>;
  private readonly attempts: CollectionReference<DocumentData>;
  private readonly people: CollectionReference<DocumentData>;
  private readonly minDigits: number;
  private readonly maxDigits: number;
  private readonly maxAttempts: number;
  private readonly lockoutMs: number;
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
    this.attempts = this.db.collection(config.pinControl.attemptsCollection);
    this.people = this.db.collection(config.pinControl.peopleCollection);
    this.minDigits = config.pinControl.minDigits;
    this.maxDigits = config.pinControl.maxDigits;
    this.maxAttempts = config.pinControl.maxAttempts;
    this.lockoutMs = config.pinControl.lockoutMs;
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
      if (claimed.operation === "set_pin") {
        await this.processSetPin(id, claimed);
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

  private async processSetPin(
    id: string,
    data: PinRequestRecord,
  ): Promise<void> {
    const personId = data.personId;
    if (!personId || !isValidPin(data.pin, this.minDigits, this.maxDigits)) {
      await this.finish(id, {
        status: "failed",
        failReason: "invalid_pin_policy",
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

    const pinHash = await bcrypt.hash(data.pin!, BCRYPT_ROUNDS);
    const now = new Date().toISOString();

    const batch = this.db.batch();
    batch.update(this.people.doc(personId), {
      pinHash,
      pinUpdatedAt: now,
    });
    batch.update(this.requests.doc(id), {
      status: "completed",
      result: { ok: true, personId },
      pin: FieldValue.delete(),
    });
    await batch.commit();

    console.log(
      JSON.stringify({
        event: "pin_defined",
        requestId: id,
        personId,
        at: now,
      }),
    );
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

    const attemptsDoc = await this.attempts.doc(uid).get();
    const record = attemptsDoc.exists
      ? (attemptsDoc.data() as PinAttemptRecord)
      : undefined;
    const now = Date.now();

    if (isLocked(record, now)) {
      await this.finish(id, {
        status: "failed",
        failReason: "attempts_locked",
        result: { valid: false, lockedUntil: record?.lockedUntil },
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

      await this.attempts.doc(uid).set(registerSuccess());
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

    const next = registerFailure(
      record,
      now,
      this.maxAttempts,
      this.lockoutMs,
    );
    await this.attempts.doc(uid).set(next);

    if (isLocked(next, Date.now())) {
      await this.finish(id, {
        status: "failed",
        failReason: "attempts_locked",
        result: { valid: false, lockedUntil: next.lockedUntil },
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
  }
}

export function createPinRequestProcessor(config: AppConfig): PinRequestProcessor {
  return new PinRequestProcessor(config);
}
