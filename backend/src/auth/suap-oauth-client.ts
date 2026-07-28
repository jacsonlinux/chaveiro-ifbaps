import type { AppConfig } from "../config/env.js";
import { HttpError } from "../http/errors.js";

export interface SuapProfile {
  readonly identificacao: string;
  readonly nome?: string;
  readonly email?: string;
  readonly campus?: string;
}

export interface SuapOAuthProvider {
  createAuthorizationUrl(state: string): string;
  exchangeCodeForProfile(code: string): Promise<SuapProfile>;
}

interface ConfiguredSuapOAuthRuntime {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly meUrl: string;
  readonly scope?: string;
}

export class SuapOAuthClient implements SuapOAuthProvider {
  constructor(private readonly config: AppConfig) {}

  createAuthorizationUrl(state: string): string {
    const runtime = requireOAuthRuntime(this.config);
    const url = new URL(runtime.authorizeUrl);

    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", runtime.clientId);
    url.searchParams.set("redirect_uri", runtime.redirectUri);
    url.searchParams.set("state", state);

    if (runtime.scope) {
      url.searchParams.set("scope", runtime.scope);
    }

    return url.toString();
  }

  async exchangeCodeForProfile(code: string): Promise<SuapProfile> {
    const runtime = requireOAuthRuntime(this.config);
    const tokenResponse = await fetch(runtime.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: runtime.redirectUri,
        client_id: runtime.clientId,
        client_secret: runtime.clientSecret
      })
    });

    if (!tokenResponse.ok) {
      throw new HttpError(
        502,
        "suap_oauth_token_failed",
        "Nao foi possivel obter token OAuth do SUAP."
      );
    }

    const tokenPayload = (await tokenResponse.json()) as { access_token?: unknown };
    if (typeof tokenPayload.access_token !== "string" || !tokenPayload.access_token) {
      throw new HttpError(
        502,
        "suap_oauth_token_invalid",
        "Resposta OAuth do SUAP nao contem token valido."
      );
    }

    const profileResponse = await fetch(runtime.meUrl, {
      headers: {
        authorization: `Bearer ${tokenPayload.access_token}`
      }
    });

    if (!profileResponse.ok) {
      throw new HttpError(
        502,
        "suap_profile_failed",
        "Nao foi possivel consultar o perfil do usuario no SUAP."
      );
    }

    return parseSuapProfile(await profileResponse.json());
  }
}

function requireOAuthRuntime(config: AppConfig): ConfiguredSuapOAuthRuntime {
  const runtime = config.suapOAuthRuntime;
  if (
    !runtime.clientId ||
    !runtime.clientSecret ||
    !runtime.redirectUri ||
    !runtime.authorizeUrl ||
    !runtime.tokenUrl ||
    !runtime.meUrl
  ) {
    throw new HttpError(
      503,
      "suap_oauth_not_configured",
      "OAuth/SUAP nao configurado no backend."
    );
  }

  return {
    clientId: runtime.clientId,
    clientSecret: runtime.clientSecret,
    redirectUri: runtime.redirectUri,
    authorizeUrl: runtime.authorizeUrl,
    tokenUrl: runtime.tokenUrl,
    meUrl: runtime.meUrl,
    scope: runtime.scope
  };
}

function parseSuapProfile(value: unknown): SuapProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(
      502,
      "suap_profile_invalid",
      "Resposta de perfil do SUAP invalida."
    );
  }

  const payload = value as Record<string, unknown>;
  const identificacao = stringField(payload.identificacao);
  if (!identificacao) {
    throw new HttpError(
      502,
      "suap_profile_invalid",
      "Perfil SUAP sem identificacao."
    );
  }

  return {
    identificacao,
    nome: stringField(payload.nome),
    email: stringField(payload.email),
    campus: stringField(payload.campus)
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
