---
name: keychain-key-movement-rules
description: Use when changing IFBA Campus Porto Seguro key control business rules for rooms, keys, key-room links, key status, withdrawals, returns, late keys, maintenance, lost/damaged keys, occurrences, audit history, privacy of responsible-user data, occupancy blocking, or future SUAP reservation behavior.
---

# Keychain Key Movement Rules

Use this skill for domain rules that affect physical key control.
Always obey `AGENTS.md` first.

## Required Reading

- `AGENTS.md`
- `README.md`
- `docs/arquitetura.md`
- relevant backend/frontend files when they exist

## Operational Principles

1. The system controls the physical and operational movement of keys.
2. SUAP remains the expected source of room occupancies for IFBA Campus Porto
   Seguro (`PS`, `campus=27`) after official authorization/API availability.
3. Every important state change must be auditable.
4. Portaria and admin actions must preserve who performed the action and who is responsible for the key.
5. User-facing privacy depends on role; do not expose responsible-person data broadly unless the policy is explicit.

## Key States

Initial states from the architecture:

- `disponivel`
- `bloqueada_por_reserva`
- `retirada`
- `em_manutencao`
- `perdida`
- `danificada`

Note: the `atrasada` state was removed. Withdrawals no longer record an
expected return time, so no late state is derived from a deadline.

Avoid adding states casually. If a new state is needed, update architecture, backend validation, frontend display, and tests together.

## Auditable Events

Initial events from the architecture:

- `retirada`
- `devolucao`
- `ocorrencia`
- `bloqueio`
- `liberacao`
- `ajuste_admin`

Each event should record at least actor, responsible person when applicable, key, room/environment, timestamp, origin, and observation when applicable.

## Reservation Rules

For future SUAP integration, keep scraping and reservation synchronization in the
backend worker. The Angular client consumes the synchronized Firestore copy.

For direct Firestore operations, model withdrawals, returns and occurrences as
auditable documents and use Firestore Security Rules plus transactions to protect
role-sensitive writes and prevent duplicate open movements for one key.

Baseline decision from the architecture:

- A confirmed SUAP occupancy blocks the linked key only during its real time
  interval, using `startsAt <= now < endsAt`.
- Blocking prevents withdrawal by third parties during the active occupancy.
- Direct withdrawal before the occupancy starts is allowed only when the
  requested/expected use does not conflict with known future occupancies.
- After `endsAt`, the scheduled block is released, but an open movement,
  overdue key, maintenance, loss, or damage keeps the physical key unavailable.
- Rooms marked by SUAP as inactive or not schedulable should be treated as
  restricted/unavailable for new ad hoc withdrawals by default, while preserving
  existing movement history.

When implementing this area, define explicit behavior for already-withdrawn keys, future occupancy conflicts, canceled/changed reservations, overlapping reservations, master keys, one key for many rooms, and many keys for one room.
