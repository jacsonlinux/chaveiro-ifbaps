import { cert, getApps, getApp, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken, type Auth } from "firebase-admin/auth";
import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";

export interface FirebaseIdentity {
  readonly uid: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly displayName?: string;
}

export interface FirebaseTokenVerifier {
  verifyIdToken(token: string): Promise<FirebaseIdentity>;
}

export class FirebaseAdminTokenVerifier implements FirebaseTokenVerifier {
  private readonly auth: Auth;

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
    this.auth = getAuth(app ?? getApp());
  }

  async verifyIdToken(token: string): Promise<FirebaseIdentity> {
    let decoded: DecodedIdToken;
    try {
      decoded = await this.auth.verifyIdToken(token);
    } catch {
      throw new HttpError(
        401,
        "invalid_firebase_token",
        "Token do Firebase invalido ou expirado.",
      );
    }

    if (!decoded.uid || !decoded.email) {
      throw new HttpError(
        401,
        "firebase_identity_incomplete",
        "Identidade do Firebase nao possui e-mail valido.",
      );
    }

    return {
      uid: decoded.uid,
      email: decoded.email.trim().toLowerCase(),
      emailVerified: decoded.email_verified === true,
      displayName:
        typeof decoded.name === "string" && decoded.name.trim()
          ? decoded.name.trim()
          : undefined,
    };
  }
}

export function readBearerToken(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}
