# ✈️ UI/UX Design Specification: `fix-publish` Workflow

This document defines the structural layout, component specifications, styling rules, and modal interactions for the **Fix & Publish** feature — step 3 of the roster run wizard.

---

## 1. Feature Purpose & Workflow Overview

- **Purpose:** Turn the roster handed over by step 2 into a legal, published roster, and keep it legal once it is live.
- **Core Interactions:**
  1. **Read the open breaks.** The page opens with exactly the breaks `evaluateRules` still raises against the roster step 2 produced.
  2. **Fix or override each one.** Law-rule breaks can only be closed by flying somebody who clears them; company-rule breaks can also be closed in writing, with a reason that goes to the audit log.
  3. **Re-check.** Every edit rewrites the roster and the break list is re-derived, so a fix that opens a second break appears at once.
  4. **Publish.** The publish button unlocks at zero open breaks; publishing sends every duty to the crew on it.
  5. **Keep it legal.** On a live roster, a sick call or a delay re-opens the workspace. A seat nobody can fill stays uncovered and is reported to Flight Scheduling.

---

## 2. Page Structure (top to bottom)

1. **Header** — `FIX & PUBLISH` (uppercase, extrabold) with the subtitle _"Fix each rule break, then publish the roster. Law rules must be fixed; company rules can be overridden with a reason."_ and the `RosterRunBadge` at `lg` and up.
2. **`<WizardSteps>`** — the three-step strip. Once the roster is published and nothing is open, all three steps show a green tick and none is highlighted.
3. **Back link** — `← Assign crew`, blue, to the left. The wizard strip shows where you are but is not itself clickable, so without this the only route back to step 2 is the sidebar.
4. **Banner row** — one `AlertBanner`, with the yellow next-step button **inside** the banner (the button is part of the sentence, so it is not in a second column).
5. **Progress row** (`<ProgressHeader>`) — heading, the open-count card with its segmented bar, and the `Publish roster` button.
6. **Rules strip** (`<RulesStrip>`) — _"Every fix is re-checked against"_ and the six numbered chips.
7. **Workspace** — two columns from `xl`: break list on the left, fix panel on the right. Stacked below `xl`.
8. **Published roster** — only once published.
9. **All breaks closed / fixed** — the closed table.
10. **Publish checks** — one row per pairing, plus the blue _Publication rule_ box.
11. **Demo: delay** — a dashed-border strip carrying the Feature 2 trigger. Not part of the mockups; it exists so the delay path is reachable.

### 2.1 Banner states

| State                          | Tone                 | Text                                                                                                                                               |
| ------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft, anything open           | —                    | none                                                                                                                                               |
| Draft, all closed, ≥1 override | success              | `All breaks closed · 2 fixed, 1 overridden with a reason. The roster is ready to publish.`                                                         |
| Draft, all fixed               | success              | `All breaks fixed · the roster is legal and ready to publish.`                                                                                     |
| Leg delayed (Feature 2)        | **info** (blue)      | `Flight change from Feature 2 · FD511 now leaves at 09:30 (+2 h). Affected legs were re-checked: REST_SHORT is still open (9 h rest, needs 10 h).` |
| Published, clean               | success              | `Roster published · 15–19 Sep · 4 legs · every crew member has been notified (Feature 13).`                                                        |
| Published, seat uncovered      | **warning** (orange) | `Roster published · FD511 not covered: no captain passes every rule (NO_LEGAL_CREW). Affected crew re-notified.`                                   |
| Published, seat refilled       | success              | `Roster updated · N. Srisai replaced S. Kittipong on FD211 (sick call). Both were re-notified (Feature 13).`                                       |

Button inside the row: `Publish roster` while draft, `Start next roster run →` once published.

### 2.2 Progress row

- Heading: `Open breaks` · `Uncovered leg` (an open seat nobody can fill) · `Sick call` (an open seat somebody can fill). The heading is larger than the page `FIX & PUBLISH` — it is the thing the operator came here to deal with.
- Count card: one row — big red number, then `of 3 rule breaks left` or `1 open seat to fill`, then the bar. The card is sized by its contents, so it grows with the run rather than sitting at a fixed width.
- Segmented bar: **fixed length**, one segment per item the run has ever had, green for closed and red for open. It only grows when the rules raise something new.
- `Publish roster` disabled is **grey, not faded yellow**. Half-opacity amber reads as "nearly ready"; a flat grey says the gate is shut.
- Below the disabled button, in red, right-aligned to it: `ROSTER_HAS_BREAKS · close 1 open break to publish`.

---

## 3. The Workspace

### 3.1 Left column

**Break list card.** Title is `Rule breaks` while drafting, `Open seats` once published. Each break is its own rounded, bordered box with a gap between them rather than a divided list, so a single item stays legible when the run grows. The selected box takes a black border; unselected ones keep a tinted border (red open, green fixed, amber overridden) so the column still separates done from not done.

| Row form          | Content                                                         |
| ----------------- | --------------------------------------------------------------- |
| Open              | `3 · NO_LOCAL_CREW` + `[Open]` pill + the short sentence        |
| Closed by a swap  | `Fixed · REST_SHORT` (tick badge, no number) + what the fix was |
| Closed in writing | `Overridden · POLICE_MIN` (tick badge) + `Reason: …`            |

**Numbering is assigned on first appearance and never reused.** Closing break 1 does not relabel break 3 — an operator who said "break 3" is still talking about the same thing.

**Eligible replacement rules card.** Subtitle: _"Roles are never mixed. Only police can fill a police seat, and local crew must speak the destination language."_ Rows: Captain `by captain role`, First officer `by first officer role`, Cabin crew `by cabin crew, Feature 9 count`, Local crew `by same language (KR, JP, TH)`, Police `by police, 2 on international legs`.

### 3.2 Right column — the fix panel

Reads as an argument: what the break is → why the roster is not legal → the numbers → what to do.

1. `FIXING` small-caps label.
2. The code, large and extrabold (`REST_SHORT`, `POLICE_MIN`, `NO_LOCAL_CREW`, `SICK CALL`).
3. The context line.
4. **Red box — no icon.** An alert glyph beside a sentence that already names the code says the same thing twice. The sentence is **ink, not red**; the tint is the alarm, and red type on top of a red wash reads as two of them. Replaced by a green box once the item is closed.
5. `WHAT THE ROSTER HAS NOW` → the facts table. Danger rows are red. No `Status` row on the rest break: the code is already the heading.
6. `REPLACE WITH` + the count (`2 legal police officers available`, `2 of 4 can take it`, `0 legal captains available`).
7. The instruction sentence.
8. The candidate cards.

Law breaks close the panel with a plain line: _"This is a law rule, so it can only be closed by flying someone who clears it. There is no override."_

### 3.3 Candidate cards

Radio on the left, then name + role line, then the four check chips — `Eligible & available`, `Rest 12 h`, `62.75 / 100 h`, `No overlap`. Failures print their reason in red beneath (`Would exceed 100 flight hours in 28 days (rule 3).`).

- Selected candidate: `[Selected]` pill, navy border.
- Blocked candidate: `[Not allowed]` red pill, greyed card, **still listed** — an operator who expected to see a colleague and cannot is looking at the reason, not at a shorter list.
- Hover or keyboard focus reveals `Select A. Rungrot · then press the swap button`.
- Nothing picked means the first legal candidate, so the common case is one click on `Swap in <name>`.
- At zero legal candidates, the blocked note replaces the button: _"Every captain fails at least one law rule, so nobody can be added."_

---

## 4. Closed Table

Heading is `All breaks fixed` when every close was a swap, `All breaks closed` when any was an override. Subtitle: _"Every leg now passes the law and company rules. Publishing sends each crew member their duties (Feature 13)."_

Columns `DATE | FLIGHT | ROUTE | PAIRING | STATUS | ACTION`. STATUS is a green `Fixed · captain swapped` / `police added` / `local crew added`, or an orange `Overridden · reason logged`. ACTION is `—`. The override **reason** is deliberately not a column: it is in the panel and in the audit log (Feature 15), and a paragraph of free text makes the one column that matters unreadable.

---

## 5. Published Roster

Subtitle: _"This roster is live. Later changes (sick calls, flight delays or cancellations) are re-checked and re-sent to the crew affected."_

Columns `FLIGHT | ROUTE | TIME | CAPTAIN | FIRST OFFICER | CABIN CREW | LOCAL CREW | POLICE | STATUS | ACTION`.

- The FLIGHT cell shows `P-101 · 15 Sep` beneath the flight number.
- Cabin prints `4 of 4` — a count reads at a glance where four names do not. Local crew prints names with nationality (`Y. Sato (JP)`) because that is what tells an operator they can be briefed.
- A missing captain prints red `Missing`. A leg missing a required seat prints red `Not covered`.
- ACTION is `Sick call` (outline) or `Find cover →` (navy) when the leg has an open seat.

---

## 6. Publish Checks

Subtitle: `Ready to publish · 0 open breaks`, plus ` · 1 overridden` where applicable.

Columns `CHECK | DATE | BASE | DETAIL | PUBLISH STATUS`. Detail reads `BKK → NRT → BKK · all checks clear`, or `… · FD511 has no captain (NO_LEGAL_CREW)`.

An override counts as closed here: the table says what publishing will do, not what the rules say.

The blue box at the bottom is titled _Publication rule_.

---

## 7. Modals

### 7.1 Override company-rule break?

Subtitle: _"Only local-crew and police breaks can be overridden. Your reason is saved to the audit log in Feature 15."_ Then a **Break to override** card (`Tue 15 Sep 2026`, `BKK → NRT`, blue `FD210` pill, `POLICE_MIN · police minimum not met · 12:30–18:30`), a `REASON` textarea, and the footnote _"Law rules can't be overridden. This closes the company-rule break only."_

The submit button stays live on an empty box on purpose: pressing it shows `REASON_REQUIRED · Write a reason before overriding. It is saved to the audit log.` A disabled button would leave the operator guessing.

### 7.2 Sick call · FD211 (pick who can't fly)

Subtitle: _"NRT → BKK · Tue 15 Sep · 19:30–23:30. Pick who can't fly; you confirm on the next step."_ A scrollable **Crew on this leg** list. Footer is `Cancel` only.

Names are spelled out in full here (`Somsak Kittipong`) — this is the list somebody acts on, and it is the name on their licence.

### 7.3 Remove crew member from this leg?

Subtitle: _"Use this for a sick call or operational removal. The leg is rechecked and legal replacements are suggested next."_ A **Crew to remove** card (`Wed 16 Sep 2026 · BKK → ICN`, `Prasit Thongdee`, blue `FD511` pill, `Captain · 07:30–12:45`) and a `REASON` input defaulted to `Sick call`.

Footer: `Cancel` + `Remove & find replacement` in red. Two steps on purpose — taking somebody off a published roster notifies every other crew member on the leg.

---

## 8. States the mock data must be able to reach

| State                    | How                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------ |
| 3 open breaks on arrival | `REST_SHORT` (Kittipong, 7 h), `POLICE_MIN` (FD210, 1 of 2), `NO_LOCAL_CREW` (FD511) |
| Fix the rest break       | `P. Thongdee` onto both P-102 legs                                                   |
| Fix the police minimum   | `T. Wongsa` onto FD210 → the published roster in the mockups                         |
| Fix the local-crew rule  | `J. Park` onto FD511                                                                 |
| Override in writing      | `POLICE_MIN` with a reason                                                           |
| Delay from Feature 2     | FD511 +2 h → rest drops to 9 h, break stays open                                     |
| Sick call, refillable    | `S. Kittipong` off FD211 → `1 legal captain available` (`N. Srisai`)                 |
| Sick call, uncoverable   | `P. Thongdee` off FD511 → `0 legal captains available`, leg uncovered                |

Police are exempt from the duty rules (1, 2, 3, 6) but not from rule 5. A police escort is booked with the station per flight rather than rostered as duty, so counting them across pairings produces rest breaks that no roster action can resolve.
