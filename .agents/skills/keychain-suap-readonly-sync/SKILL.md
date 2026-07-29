---
name: keychain-suap-readonly-sync
description: Use when implementing or reviewing the IFBA Campus Porto Seguro (`PS`, `campus=27`) read-only SUAP synchronization flow, including authorized web scraping, Playwright/browser automation, SUAP login session handling, room option parsing, reservation/occupancy parsing, normalization, cache, Firestore persistence, sync jobs, deduplication, cancellation detection, privacy filtering, feature flags, and fallback to official SUAP API when available.
---

# Keychain Suap Readonly Sync

Use this skill for the SUAP room, reservation and occupancy sync provider.
Always obey `AGENTS.md` first.
Also use `keychain-secrets-runtime` when touching env variables, credentials,
session files, logs, PM2, deploy, or any code path that may expose secrets.
Use `keychain-key-movement-rules` when sync behavior affects key blocking.

Current institutional scope is IFBA Campus Porto Seguro only, identified in SUAP
as `PS` and currently filtered as `campus=27`. Do not broaden the scraper to
other campuses without an explicit architecture decision.

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
8. Publish normalized rooms and occupancies to Firestore for the Angular PWA;
   the PWA reads the Firestore copy directly and never calls the scraping
   worker.
9. Keep a feature flag to disable web scraping quickly.

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

Normalized occupancies should include at least:

```text
externalId
source
sourceKind
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

Room documents should preserve dynamic SUAP options:

```text
externalId
roomCode
name
campus = PS
active
schedulable
scheduleUrl
sourceUrl
firstSeenAt
lastSeenAt
updatedAt
```

## Sync Rules

1. Use Firestore as persistent copy of normalized rooms and occupancies.
2. Use backend memory cache only for fast reads and short TTL.
3. Use local JSON only for development, fixtures, or temporary fallback.
4. Use idempotent upsert by `externalId`; if absent, use deterministic `fingerprint`.
5. Treat changed fingerprint on same identifier as an update.
6. Do not immediately cancel/delete a reservation missing from one sync; mark as absent/suspect and confirm on later sync.
7. Preserve overlapping reservations and flag them as conflicts.
8. Record sync events with counts for created, updated, unchanged, absent, canceled, conflicted, and failed items.
9. Do not release a key only because the latest SUAP sync failed.
10. Treat `active`, `schedulable` and `scheduleUrl` as dynamic room data; SUAP
    administrators may change them and the worker must reflect those changes in
    Firestore without deleting local movement history.
11. A confirmed occupancy blocks a key only during its real chronological
    interval, `startsAt <= now < endsAt`; do not reintroduce a minutes-before
    blocking rule.

## Scraping Cadence

- Reservations/occupancies for today and near future: continuous job,
  initially every 15 minutes, configurable, with backoff on failure.
- Room catalog and room options: initial sync, manual sync, and occasional
  larger-interval sync because room metadata changes less frequently.
- Native classes: own cadence after the most stable SUAP source is confirmed;
  use daily/shift, weekly/manual, or selective per-room scraping depending on
  source cost and stability.
- Request details: load on demand or only for new/changed records; do not open
  every detail page on every short cycle.

## Implementation Order

1. Implement local provider and normalized model first.
2. Add parser fixtures from sanitized sample HTML or table extracts.
3. Implement web login/session handling behind a read-only provider.
4. Add Firestore persistence and sync event records.
5. Add scheduled sync, manual sync, cache TTL, backoff, and failure reporting.
6. Wire occupancy data into chronological key blocking rules.

## Validation

- Unit test normalization, fingerprint generation, upsert, update detection, absence/cancellation handling, and conflict preservation.
- Test parser behavior with sanitized fixtures, not live sensitive HTML.
- Run backend typecheck/tests once available.
- Run `git diff --check`.
- Run secret hygiene checks from `keychain-secrets-runtime`.
