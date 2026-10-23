# flight-scheduling (G02) styling rules

Design source: Figma file `vh4YapGP8tVxXtbVp3MrJO` ("F2 / Flight Scheduling & Network Ops"), components frame `7:1913`. The file follows the F4 Fare setup screen: Inter, navy `#102544`, `#cbd5e1` borders. It defines no Figma variables, so the values below were read from the components.

## Rules

- Every colour, radius and font in this feature comes from the `--fs-*` tokens at the top of `flight-scheduling.css`. Do not write hex values in rules or inline styles.
- If a screen needs a value that is not a token, read it from Figma first, then add one token. Do not guess a nearby colour.
- Reuse the shared components in `components/` (`StaffShell`, `PageHeader`, `Card`, `Stats`, `TableWrap`, `SegmentedControl`, `StatusPill`, `FormField`, `SelectField`, `Callout`, `Toast`, `ListState`, `EmptyState`, `RouteCodes`, `DayBadges`, `AirportTabs`, `NotConnected`, `BatchActions`). Do not write `<section className="fs-card">`, `fs-table-wrap`, `fs-seg`, `fs-summary` or `fs-empty` markup by hand before writing new markup.
- Anything with a table in the database comes from the API, even when the table is empty: airports, routes, patterns, flights, previews, airport fees, congestion windows, settings, disruption reasons, conflicts and flight events. Never mock it. Person B owns the conflict, event and disruption endpoints; Claude does not write backend code for them from here.
- No demo data. What belongs to another feature or has no table or API yet (F1 clock, F9 aircraft, gate checks, cost estimate, impact, the approval flow, approval policy, partner airlines per route) is not faked. Its UI stays in the page but is hidden behind its flag in `connected.ts`, where lists are empty and actions refuse; a page whose whole body is hidden says so with `<NotConnected>`. When the endpoint exists, set the flag, replace the stub with the real call and drop the notice.
- Class names are prefixed `fs-` and live in `flight-scheduling.css`. Pages stay light-only (`color-scheme: light` on `.fs-shell`).

## Tokens

| Token                                | Value                 | Use                                                             |
| ------------------------------------ | --------------------- | --------------------------------------------------------------- |
| `--fs-navy`                          | `#102544`             | primary button, body text, checkbox, focus border               |
| `--fs-navy-hover`                    | `#293d61`             | primary hover, active sidebar item                              |
| `--fs-ink`                           | `#0a1424`             | page title, toast background                                    |
| `--fs-sidebar` / `--fs-sidebar-text` | `#14213d` / `#b7c1d1` | sidebar background / muted text                                 |
| `--fs-accent`                        | `#f2a800`             | brand bar under the wordmark                                    |
| `--fs-page`                          | `#f7f9fc`             | page background                                                 |
| `--fs-muted`                         | `#677287`             | secondary text, field labels                                    |
| `--fs-slate`                         | `#455473`             | dark tag, neutral pill text                                     |
| `--fs-border` / `--fs-divider`       | `#cbd5e1` / `#e2e8f0` | borders / table row lines                                       |
| `--fs-head`                          | `#e8edf5`             | table header, neutral pill                                      |
| `--fs-tint`                          | `#eef3ff`             | outline and ghost button hover                                  |
| `--fs-yellow`                        | `#fff1c7`             | yellow tag                                                      |
| `--fs-good(-bg)`                     | `#1f7a4d` / `#e3f2ea` | active, success                                                 |
| `--fs-warn(-bg)`                     | `#b45309` / `#fcefd9` | delayed, holding, diverted                                      |
| `--fs-crit(-bg)`                     | `#b42318` / `#fdecec` | cancelled, error (`--fs-crit-line` `#db1f29` for error borders) |
| `--fs-info-bg`                       | `#dde6f7`             | departed, arrived                                               |

Radius: `--fs-radius-xs` 2 (tag), `-sm` 6 (small button, nav item), `--fs-radius` 8 (button, table, callout, toast), `-lg` 10 (field), pill 999.

Type: Inter (`--fs-font`); brand wordmark Merriweather Black (`--fs-font-brand`). Use the `--fs-text-*` tokens, never a raw size. Scale (desktop, base 16px), from the team's typography rules:

| Token             | Size / weight   | Use                                                           |
| ----------------- | --------------- | ------------------------------------------------------------- |
| `--fs-text-h1`    | 48 / Extra Bold | main page title                                               |
| `--fs-text-h2`    | 36 / Extra Bold | main section titles                                           |
| `--fs-text-h3`    | 28 / Bold       | card, modal, dashboard titles                                 |
| `--fs-text-h4`    | 22 / Semi Bold  | grouped form titles, small sections, stat numbers             |
| `--fs-text-lg`    | 18 / Regular    | important paragraphs, short descriptions                      |
| `--fs-text-body`  | 16 / Regular    | normal descriptions, helper text, card content                |
| `--fs-text-label` | 14 / Medium     | form, filter and table labels; nav; table cells; field values |

Also in the stylesheet: `--fs-text-caption` 12 (tags, pills, helper text, sidebar small text; Figma's caption style), `--fs-text-action` 14 Semi Bold (buttons) and `--fs-text-brand` 40 (wordmark). The action size is an assumption: the shared type rules were cut off at that row, so change the one token when the real size is known. Tablet and mobile scales were not given; below 800px the page title drops to the H2 size.

Shadow: toast `0 4px 9px rgb(0 0 0 / 25%)`; focus ring `0 0 0 3px rgb(16 37 68 / 12%)` with a navy border. Table row hover: 5% navy tint plus a 3px navy bar on the left.

The fonts are not bundled yet; `Inter` and `Merriweather` fall back to system fonts until they are added under `assets/`.

## Responsive

Breakpoints: 1100px (tablet, narrower sidebar, tables scroll inside their box) and 800px (phone). On a phone the sidebar becomes a full-screen menu behind the hamburger button in `StaffShell`, forms stack to one column, and every `.fs-table` turns into one card per row. `useTableLabels` (called by `StaffShell`) copies each column header onto its cells as `data-label`, so a new table needs only a `<thead>` with `<th>` text and no extra markup. Phone sizes come from the Figma mobile frames (393px wide); the page title uses `--fs-text-title-sm`.
