---
name: keychain-ux-portaria-minimal
description: Use when designing or reviewing the IFBA/IFBAPS portaria PWA for fast, minimal and accessible key-room operations, including status scanning, withdrawal and return actions, filters, detail drawers, Angular Material patterns and responsive operational UX.
---

# Keychain Portaria UX

Use this skill for the operator-facing Angular/PWA experience. Always obey
`AGENTS.md`, `keychain-frontend-pwa`, `keychain-backend` and
`keychain-key-movement-rules` when the task touches their boundaries.

## Product boundary

- The PWA is for portaria operators, not for requesting or approving SUAP
  reservations.
- SUAP remains the official reservation system. Reservations arrive as
  read-only, normalized data through the backend API.
- The frontend never reads Firestore directly and never receives SUAP
  credentials, scraping cookies or Firebase Admin credentials.

## Primary workflow

Keep daily operation in one primary view:

1. Authenticate the operator.
2. Search a room or physical key.
3. See room, key, effective status, open movement and reservation warning in
   the same row or card.
4. Register withdrawal or return with the smallest safe form.
5. Show confirmation and refresh the affected record from the API.

Put history, reports, catalog administration and sync diagnostics in secondary
navigation. Do not force the operator through multiple pages for a normal
withdrawal or return.

## Information hierarchy

The main list prioritizes:

- room name and key code;
- effective status: available, reserved, withdrawn, late, maintenance, lost
  or damaged;
- current responsible person and withdrawal time when the key is out;
- expected return and blocking reservation when relevant;
- direct action for withdrawal, return or details.

Use compact filters for status and search by room/key. Preserve stable row/card
dimensions so status labels and actions do not shift the layout.

## Interaction rules

- Use Angular Material components and familiar icons with tooltips.
- Prefer a side drawer or dialog for movement details so the operator keeps the
  position in the main list.
- Require confirmation only for destructive or ambiguous actions. Normal
  withdrawal/return should be short, but must show room and key before submit.
- Disable submit while an operation is pending and show backend validation errors
  next to the affected action.
- Treat backend authorization and availability as authoritative; frontend guards
  are only navigation and feedback.
- Never infer a successful write from local UI state. Refresh from the API.

## Responsive and accessibility checks

- Support desktop portaria screens and narrow tablet/mobile widths.
- Keep primary actions reachable without horizontal scrolling.
- Use text plus color/icon for status; never rely on color alone.
- Provide labels, focus states, keyboard navigation and readable contrast.
- Avoid dashboard decoration that competes with the room/key list.

## Data and privacy

- Display responsible-user details only for roles allowed by the backend.
- Render sanitized reservation warnings and sync state; never display raw
  scraper errors, HTML, cookies or tokens.
- Keep room/key identifiers stable because movements and reservations depend on
  them.

## Validation

- Run the Angular production build and relevant frontend tests.
- Check the main view at desktop and narrow responsive widths.
- Verify withdrawal, return, filtering and detail interactions against the API.
- Confirm no frontend bundle contains secrets or direct Firestore/Admin SDK
  access.
