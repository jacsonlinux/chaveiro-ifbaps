---
name: keychain-key-movement-rules
description: Use when changing IFBA/IFBAPS key control business rules for rooms, keys, key-room links, key status, withdrawals, returns, late keys, maintenance, lost/damaged keys, occurrences, audit history, privacy of responsible-user data, reservation blocking, or future SUAP reservation behavior.
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
2. SUAP remains the expected source of room reservations only after official authorization/API availability.
3. Every important state change must be auditable.
4. Portaria and admin actions must preserve who performed the action and who is responsible for the key.
5. User-facing privacy depends on role; do not expose responsible-person data broadly unless the policy is explicit.

## Key States

Initial states from the architecture:

- `disponivel`
- `bloqueada_por_reserva`
- `retirada`
- `atrasada`
- `em_manutencao`
- `perdida`
- `danificada`

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

For future SUAP integration, use backend-side reservation logic.

Baseline decision from the architecture:

- A reservation may block the linked key 30 minutes before the reservation start.
- Blocking prevents withdrawal by third parties.
- Direct withdrawal should not compromise known future reservations.

When implementing this area, define explicit behavior for already-withdrawn keys, near-future reservations, canceled/changed reservations, overlapping reservations, master keys, one key for many rooms, and many keys for one room.
