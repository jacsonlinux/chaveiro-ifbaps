---
name: keychain-frontend-pwa
description: Use when implementing or reviewing the IFBA/IFBAPS key control frontend/PWA, including Angular setup, routing, screens for portaria operations, key availability, rooms, withdrawals, returns, occurrences, admin views, HTTP API integration, Firebase Hosting config, responsive UI, and frontend build validation.
---

# Keychain Frontend PWA

Use this skill for frontend implementation and review.
Always obey `AGENTS.md` first.
Also use `keychain-secrets-runtime` when touching Firebase Hosting, environment files, public API URLs, or deploy scripts.

## Required Reading

- `AGENTS.md`
- `README.md`
- `docs/arquitetura.md`
- frontend files relevant to the change

## Core Contracts

1. Build an operational PWA, not a marketing landing page.
2. The frontend consumes the backend API and must not access secret files or privileged credentials.
3. Keep authorization enforcement in the backend; frontend guards are only UX and navigation support.
4. Make portaria workflows fast: search/scan key, see status, register withdrawal, register return, add occurrence, and review current open movements.
5. Use clear Portuguese operational copy.
6. Prefer compact, scannable screens for repeated use at the portaria.
7. Show only personal data appropriate to the user's role and the privacy rules recorded in the architecture.
8. Keep Firebase Hosting config focused on static build output and SPA rewrites.

## Expected Views

- login/auth state
- operational dashboard for portaria
- key list and key detail
- room/environment list and detail
- withdrawal and return flow
- movement history
- occurrence registration
- admin configuration
- future reservation/SUAP visibility

## Validation

Run the project-specific checks once they exist. Until then, use the smallest available reliable checks, such as:

- Angular typecheck/build
- frontend tests
- lint or format checks
- `git diff --check`
