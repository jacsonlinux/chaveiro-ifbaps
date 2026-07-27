---
name: keychain-backend-mvp
description: Use when implementing or reviewing the IFBA/IFBAPS key control backend, including Node.js/TypeScript setup, HTTP API, Firestore/Firebase Admin access, authentication, authorization, roles, audit logging, PM2 runtime, tests, service boundaries, and future SUAP adapter preparation.
---

# Keychain Backend MVP

Use this skill for backend implementation and review.
Always obey `AGENTS.md` first.
Also use `keychain-secrets-runtime` when touching env, Firebase Admin, PM2, deploy, or credential paths.

## Required Reading

- `AGENTS.md`
- `README.md`
- `docs/arquitetura.md`
- backend files relevant to the change

## Core Contracts

1. Start with an MVP that does not depend on SUAP.
2. Keep business rules and privileged operations in the backend, not only in the frontend.
3. Model audit data explicitly: who registered the action, who received the key, key, room, timestamp, origin, status change, and notes when applicable.
4. Protect role-sensitive operations in backend authorization checks.
5. Keep Firebase Admin SDK and service-account access server-side only.
6. Treat SUAP integration as a future adapter behind backend boundaries; do not scrape or automate SUAP without institutional authorization.
7. Prefer small modules and direct code until real duplication or complexity justifies more structure.
8. Keep validation close to the API boundary and preserve consistent error responses.

## Initial Domain Areas

- users and roles
- rooms/environments
- keys and key-room links
- withdrawals and returns
- occurrences
- audit/history
- future SUAP reservation lookup adapter

Create internal folders only as implementation needs become concrete.

## Validation

Run the project-specific checks once they exist. Until then, use the smallest available reliable checks, such as:

- TypeScript typecheck
- backend tests
- lint or format checks
- `git diff --check`
