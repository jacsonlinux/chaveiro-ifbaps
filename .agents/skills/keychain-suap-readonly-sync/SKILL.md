---
name: keychain-suap-readonly-sync
description: Use when implementing or reviewing the IFBA/IFBAPS read-only SUAP reservation synchronization flow, including authorized web scraping, Playwright/browser automation, SUAP login session handling, reservation parsing, normalization, cache, Firestore persistence, sync jobs, deduplication, cancellation detection, privacy filtering, feature flags, and fallback to official SUAP API when available.
---

# Keychain Suap Readonly Sync

Use this skill for the SUAP reservation sync provider.
Always obey `AGENTS.md` first.
Also use `keychain-secrets-runtime` when touching env variables, credentials,
session files, logs, PM2, deploy, or any code path that may expose secrets.
Use `keychain-key-movement-rules` when sync behavior affects key blocking.

## Required Reading

- `AGENTS.md`
- `README.md`
- `docs/arquitetura.md`
- `docs/plano-implementacao.md`
- relevant backend files when they exist

## Boundaries

1. Prefer official SUAP API or authorized JSON endpoint when available.
2. Use web automation only as authorized read-only fallback.
3. Never create, update, cancel, or submit reservations in SUAP through web automation.
4. Keep SUAP credentials, cookies, tokens, and storage state outside the repository.
5. Do not log raw HTML, cookies, tokens, passwords, or full personal data.
6. Keep the frontend isolated from SUAP sessions and credentials.
7. Make the provider replaceable through the `ReservationProvider` contract.
8. Keep a feature flag to disable web scraping quickly.

## Provider Contract

Keep providers interchangeable:

```text
ReservationProvider
  -> LocalReservationProvider
  -> SuapApiReservationProvider
  -> SuapWebReadOnlyReservationProvider
```

Use:

```text
SUAP_RESERVATION_PROVIDER=local|api|web-readonly
```

Normalized reservations should include at least:

```text
externalId
source
roomName
roomExternalId
campus
startsAt
endsAt
responsibleName
responsibleIdentifier
purpose
status
fingerprint
firstSeenAt
lastSeenAt
lastSyncedAt
deletedOrCanceledAt
rawVersion
```

## Sync Rules

1. Use Firestore as persistent copy of normalized reservations.
2. Use backend memory cache only for fast reads and short TTL.
3. Use local JSON only for development, fixtures, or temporary fallback.
4. Use idempotent upsert by `externalId`; if absent, use deterministic `fingerprint`.
5. Treat changed fingerprint on same identifier as an update.
6. Do not immediately cancel/delete a reservation missing from one sync; mark as absent/suspect and confirm on later sync.
7. Preserve overlapping reservations and flag them as conflicts.
8. Record sync events with counts for created, updated, unchanged, absent, canceled, conflicted, and failed items.
9. Do not release a key only because the latest SUAP sync failed.

## Implementation Order

1. Implement local provider and normalized model first.
2. Add parser fixtures from sanitized sample HTML or table extracts.
3. Implement web login/session handling behind a read-only provider.
4. Add Firestore persistence and sync event records.
5. Add scheduled sync, manual sync, cache TTL, backoff, and failure reporting.
6. Wire reservation data into key blocking rules.

## Validation

- Unit test normalization, fingerprint generation, upsert, update detection, absence/cancellation handling, and conflict preservation.
- Test parser behavior with sanitized fixtures, not live sensitive HTML.
- Run backend typecheck/tests once available.
- Run `git diff --check`.
- Run secret hygiene checks from `keychain-secrets-runtime`.
