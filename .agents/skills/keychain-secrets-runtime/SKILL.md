---
name: keychain-secrets-runtime
description: Use when working on IFBA Campus Porto Seguro key control environment variables, external secret files, Firebase Admin service account usage, .gitignore, backend runtime configuration, PM2 ecosystem config, deploy scripts, logs, repository hygiene, or any change that could expose credentials.
---

# Keychain Secrets Runtime

Use this skill for secrets, runtime configuration, deploy hygiene, and repository safety.
Always obey `AGENTS.md` first.

## Required Reading

- `AGENTS.md`
- `README.md`
- `.gitignore`
- `docs/arquitetura.md`
- backend runtime files when they exist
- deploy or PM2 scripts when they exist

## Secrets Policy

Do not read, print, copy, commit, or move real secret values into the repository.

Sensitive files live outside the repo:

- `/etc/chaveiro-ifbaps/.env`
- `/etc/chaveiro-ifbaps/chaveiro-ifbaps-firebase-adminsdk-fbsvc-51fc01c4c3.json`

Versionable files may mention env var names and external paths, but never real values.

## Workflow

1. Keep frontend code free of service accounts, `client_secret`, SUAP passwords, admin tokens, and private keys.
2. Keep privileged Firebase Admin SDK access in the backend only.
   The Angular app may use the Firebase Web SDK and public project configuration,
   but never the service account or Admin SDK.
3. If examples are needed, create `.env.example` with placeholder values only.
4. Keep `.env`, `.env.*`, service-account JSON files, private keys, logs, builds, and generated secrets out of Git.
5. Do not echo env files, PM2 environments, service-account JSON, or logs containing secrets.
6. When changing runtime config, verify startup assumptions and update `README.md`, `AGENTS.md`, or `docs/arquitetura.md` if the operational contract changes.
7. If a credential was exposed or committed, report the risk and recommend rotation.

The PIN worker uses `PIN_LOOKUP_SECRET` for uniqueness fingerprints and
`PIN_VAULT_SECRET` to encrypt the persistent PIN copy at rest. Both values must
remain only in the external runtime environment; changing either secret can
make existing PIN fingerprints or encrypted PINs unrecoverable, so rotate them
only with an explicit migration plan.

## Checks

- `git status --short`
- `git ls-files | rg '(^|/)(\\.env|\\.env\\..*|.*firebase-adminsdk.*\\.json|service-account.*\\.json|.*\\.pem|.*\\.key|.*\\.log)$'`
- `git diff --check`
