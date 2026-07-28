# Keywest UI Patterns for Keychain

Use this reference only when implementing visual details from the local
Keywest dashboard. It records the reusable patterns that matter for Keychain.

## Token Names

Keywest uses these stable concepts:

```css
--page-bg
--surface
--surface-muted
--surface-strong
--border
--border-strong
--text
--muted
--accent
--accent-strong
--accent-soft
--warning
--warning-soft
--active
--active-soft
--success
--success-soft
--danger
--danger-soft
--shadow
```

For Keychain, keep the names or map them clearly to existing variables. Avoid
one-off hex values inside operational components.

## Page Structure

Preferred operational structure:

```text
sticky topbar
page shell, about 1120px wide
compact context band
summary cards
single operational list
dialog or drawer for details
mobile floating menu for secondary controls
```

## List Row Shape

Rows should be visually similar to Keywest appointment rows:

- list wrapper has one border and one surface background;
- each row has no card shadow;
- each row has bottom separator;
- each row has 3px status stripe;
- row content uses one primary identity, one time/status block and one action
  block;
- actions have stable width on desktop and full width on mobile;
- detail chevron is hidden on mobile.

## Dialog Shape

Dialog details follow:

- fixed centered panel;
- backdrop;
- max width around 620px;
- header with status row, title and close icon;
- `dl` grid for facts;
- action footer or small form at the bottom.

## Feedback Pattern

For important writes, Keywest uses a shared feedback host:

- confirmation backdrop with compact dialog;
- title, message, cancel and confirm actions;
- warn tone for risky actions;
- toast at bottom-right for success/error/info;
- mobile dialog actions stack vertically.

For Keychain, this is useful for confirming withdrawal during a reservation
blocking window, return confirmation, failed Firestore writes and successful
operations.

## Form Pattern

Operational forms use:

- one primary card, not nested cards;
- `mat-form-field appearance="outline"`;
- compact section titles with a small Material icon;
- field errors close to the field;
- side summary only for admin/configuration, not for the main portaria list;
- mobile action buttons full width.

## Filter Pattern

Admin/list filters use pill buttons:

- active filter uses accent border and accent-soft background;
- filter row wraps naturally;
- filters appear below the context band or next to list title;
- filters should not create a separate navigation layer.

For Keychain, use this for status filters such as `Todas`, `Disponiveis`,
`Reservadas`, `Retiradas` and `Atrasadas`.

## State Pattern

Use one bordered state panel for:

- loading;
- empty result;
- Firestore/SUAP sync error;
- no matching filter.

The state panel should not look like a full dashboard card. It should be
compact, actionable when possible, and preserve the current list context.

## What Not to Copy

- Keywest logo and petshop brand.
- Pet, appointment, taxi, grooming or customer domain labels.
- Firebase project config, role allowlists or Firestore collection names.
- Admin automation controls unrelated to Keychain.
