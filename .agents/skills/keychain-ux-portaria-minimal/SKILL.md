---
name: keychain-ux-portaria-minimal
description: Use when designing or reviewing the IFBA/IFBAPS portaria PWA for fast, minimal and accessible key-room operations, including status scanning, withdrawal and return actions, filters, detail drawers, Angular Material patterns and responsive operational UX.
---

# Keychain Portaria UX

Use this skill for the operator-facing Angular/PWA experience. Always obey
`AGENTS.md`, `keychain-frontend-pwa`, `keychain-backend` and
`keychain-key-movement-rules` when the task touches their boundaries.

## Design reference and adaptation

The Keywest Petshop application is a visual reference only:
`https://keywest-petshop.web.app/dashboard`.
When the local project is available, use `keychain-app-designer` and inspect
`/opt/kwps-alphaville/dev/dashboard` for concrete layout/style patterns before
rewriting portaria screens.

Reusable patterns from the reference include a centered and quiet login
surface, clear type hierarchy, restrained accent color, prominent Google sign-in
action, compact status treatments and consistent Material iconography. Adapt
those patterns to IFBA/IFBAPS terminology and the portaria workflow; do not copy
pet-shop branding, entities, navigation or decorative content.

For this product, the operational list is more important than a dashboard or a
sidebar. Keep the default portaria route focused on rooms, physical keys and
the next safe action. Secondary navigation may contain history, occurrences
and reports, but must not compete with the daily key workflow.

Use the existing frontend tokens and Angular Material theme as the source of
truth. Prefer self-hosted icon/font assets already in the bundle; do not add a
runtime dependency on a remote icon CDN. When a new visual token is needed,
add it at the shared theme level instead of hard-coding a page-only color.

## Product boundary

- The PWA is for portaria operators, not for requesting or approving SUAP
  reservations.
- SUAP remains the official reservation system. Reservations arrive as
  read-only, normalized documents in Firestore through the backend worker.
- The frontend reads and writes only through the Firebase Web SDK and Firestore
  Security Rules; it never receives SUAP credentials, scraping cookies or
  Firebase Admin credentials.

## Primary workflow

Keep daily operation in one primary view:

1. Authenticate the operator.
2. Search a room or physical key.
3. See room, key, effective status, open movement and reservation warning in
   the same row or card.
4. Register withdrawal or return with the smallest safe form.
5. Show confirmation and refresh the affected record from Firestore.

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
- Use Material buttons, cards, chips, form controls and dialogs consistently;
  native controls are acceptable only when the existing screen does not yet
  have the Material equivalent and the interaction remains accessible.
- Prefer a side drawer or dialog for movement details so the operator keeps the
  position in the main list.
- Require confirmation only for destructive or ambiguous actions. Normal
  withdrawal/return should be short, but must show room and key before submit.
- Disable submit while an operation is pending and show Firestore validation errors
  next to the affected action.
- Treat Firestore Security Rules and transaction results as authoritative;
  frontend guards are only navigation and feedback.
- Never infer a successful write from local UI state. Refresh from Firestore.
- Do not ask the operator to re-enter values already known from the selected
  room, key or authenticated identity. Keep manual fields only as an explicit
  fallback for incomplete catalog data.

## Responsive and accessibility checks

- Support desktop portaria screens and narrow tablet/mobile widths.
- Keep primary actions reachable without horizontal scrolling.
- Use text plus color/icon for status; never rely on color alone.
- Provide labels, focus states, keyboard navigation and readable contrast.
- Avoid dashboard decoration that competes with the room/key list.
- At mobile widths, stack the selected-key detail and action form without
  requiring horizontal scrolling; preserve a minimum 44px action target.
- Verify icon fonts and ligatures render in a fresh browser profile, including
  offline after the PWA assets have been cached.

## Interface states

Every operational data surface must define these states before implementation:

- authentication pending, denied and signed out;
- Firestore loading, unavailable and stale synchronization data;
- empty catalog or no matching room/key;
- selected key with no linked room;
- available, reserved, withdrawn, late, maintenance, lost and damaged;
- successful withdrawal/return and rejected operation.

Do not hide a Firestore or synchronization failure behind an empty list. Explain the
state, preserve the last safe data when policy allows and provide a recovery
action.

## Theme boundary

Light mode is the current operational baseline. Dark mode may be added only
when the product requires it, and then all status colors, focus indicators and
Material surfaces must use shared theme tokens. Do not introduce a dark-mode
toggle as decoration or make the portaria workflow depend on it.

## Data and privacy

- Display responsible-user details only for roles allowed by the backend.
- Render sanitized reservation warnings and sync state; never display raw
  scraper errors, HTML, cookies or tokens.
- Keep room/key identifiers stable because movements and reservations depend on
  them.

## Validation

- Run the Angular production build and relevant frontend tests.
- Check the main view at desktop and narrow responsive widths.
- Inspect a fresh browser render, not only the compiled HTML; check for missing
  fonts, clipped labels, overlapping controls and horizontal overflow.
- Verify withdrawal, return, filtering and detail interactions against Firestore
  Security Rules and transaction results.
- Confirm no frontend bundle contains secrets or Firebase Admin SDK access;
  Firebase Web SDK and public Firebase configuration are allowed.
