---
name: keychain-app-designer
description: Use when designing, refactoring, or reviewing the IFBA Campus Porto Seguro Angular PWA visual language, especially when applying the local Keywest Petshop dashboard reference, design tokens, responsive operational layouts, topbar, action lists, dialogs, mobile menu, login surface, dark/light theme behavior, or UX consistency across screens.
---

# Keychain App Designer

Use this skill for visual design and UX consistency in the Keychain PWA.
Always obey `AGENTS.md`, `keychain-frontend-pwa`, `keychain-ux-portaria-minimal`
and `keychain-key-movement-rules` when the change touches the portaria workflow.

## Reference Source

Primary local reference (external, when available):

```text
/opt/kwps-alphaville/dev/dashboard
```

Repo-local mirror, always available in this repository:

```text
docs/src
```

Inspect the mirror (`docs/src`) when visual work is requested, especially:

- `src/styles.scss` (mirror: `docs/src/styles.scss`): global tokens, page
  shell, badge style and dark theme.
- `src/app/login/login.component.scss` (mirror:
  `docs/src/app/login/login.component.scss`): centered login card and Google
  action.
- `src/app/shared/dashboard-topbar/*` (mirror:
  `docs/src/app/shared/dashboard-topbar/*`): sticky translucent topbar.
- `src/app/dashboard/dashboard.component.*` (mirror:
  `docs/src/app/dashboard/*`): hero, day strip, summary cards, operational list
  rows, action buttons and detail dialog.
- `src/app/shared/mobile-action-menu/*` (mirror:
  `docs/src/app/shared/mobile-action-menu/*`): mobile floating action menu.
- `src/app/shared/operation-feedback/*` (mirror:
  `docs/src/app/shared/operation-feedback/*`): confirmation and notification
  pattern.
- `src/app/staff/staff.component.*` (mirror:
  `docs/src/app/staff/*`): dense operational forms, preview cards, side summary
  and responsive configuration layout.
- `src/app/abuse-review/abuse-review.component.*` (mirror:
  `docs/src/app/abuse-review/*`): filter chips, admin list rows, status dots,
  pill styling, empty/loading/error states and detail dialog.

Do not copy Keywest domain concepts, names, logos, Firebase config, roles or
data model. Extract only general UI patterns and adapt them to rooms, keys,
reservations and portaria operations.

## Extracted Visual Language

- Use a restrained token system: page background, surface, muted surface,
  stronger surface, border, stronger border, text, muted text, accent, warning,
  success, danger and shadow.
- Prefer one centered `.page-shell` around `1120px` for operational screens.
- Use a sticky topbar with compact brand text, current context and direct
  actions. Hide crowded topbar actions on mobile.
- Use a compact hero or context band only when it helps orientation. Keep it
  shallow, bordered and utilitarian.
- Use small summary cards for counts that answer operational questions.
- Use a single-level list of rows for daily work. Rows should have subtle
  borders, a 3px left status stripe, compact icons, stable action area and
  clear hover/focus states.
- Keep primary row actions visible. Put secondary details in a dialog/drawer.
- Use status pills/chips with text plus color/icon; never rely on color alone.
- Use a modal dialog for detail/confirmation when the operator needs more
  context without leaving the list.
- Use a floating mobile action menu only for secondary navigation/settings; it
  must not cover the main row action.
- Keep radii mostly 8-10px. Avoid decorative gradients, oversized cards and
  marketing hero layouts.
- Use inline filter chips or compact controls for status filters. Filters should
  sit near the list heading and not dominate the first viewport.
- Use state panels for loading, empty and error states with one icon, one title
  and one short message.
- Use toasts for operation feedback and a small confirmation dialog for
  ambiguous or risky writes.

## Keychain Adaptation

For the portaria screen, the primary row subject is the physical key/sala code,
for example `A02`, `C07` or `B03`. Internal SUAP ids such as `1281` must stay
out of the operator-facing list.

The main list should be based on the complete synchronized room/key catalog.
Reservation data complements each room/key row when a matching reservation
exists. The operator must still see rooms with no reservation so direct
withdrawal remains possible when no blocking rule applies.

Details should show:

- readable key/sala code;
- current key status;
- reservation of the selected day when present;
- responsible person from SUAP when present;
- current holder and withdrawal time when the key is out;
- direct withdrawal or return form.

Admin/configuration screens may use Keywest's two-column pattern: primary form
card plus compact side summary. Portaria daily operation should stay list-first
and should not become a multi-card dashboard.

## Implementation Guidance

- Prefer shared tokens in global or component-level CSS before adding ad hoc
  colors.
- Use Angular Material buttons, icons, cards and dialogs where available.
- Prefer row/list buttons over table columns for routine portaria actions.
- Keep list rows around 64-76px tall on desktop and stacked/full-width on mobile.
- Keep action buttons at a stable width on desktop and full width on mobile.
- Keep components thin: presentation helpers can stay in the component, but
  Firestore access belongs in services.
- Keep Portuguese operational copy concise.
- Preserve responsive behavior at desktop, tablet and mobile widths.
- Build dark mode only through tokens/classes, not hard-coded inverted colors.

## Validation

After visual changes:

```bash
cd frontend
npm run build
```

Also run `git diff --check`. For substantial UI changes, inspect a fresh
browser render at desktop and mobile widths before committing.
