# Screening Queue frontend

Route: `/screening-queue`, under the existing staff authenticated layout. Run `npm run dev -w apps/staff-web`, sign in, then open the route. UI stays in `features/security-screening`; the route only validates URL state and connects the existing logout handler.

## Requirements used

The user supplied **Feature 7 — Customer & Passenger Profiles (Iteration-03)** and the **#group10-chat** discussion. The chat calls the 11 October schema notes suggestions and records the subsequent update to v3 on 12 October. Iteration-03 is the final behavior reference where the two differ:

| Topic              | Earlier chat proposal                    | Iteration-03 used here                                                               |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Weak match         | Similarity >= 0.7                        | Similarity >= 0.6 with different/missing DOB                                         |
| Probable match     | Partial examples                         | Same passport with different/missing nationality, OR similarity >= 0.5 with same DOB |
| Review correction  | One review per check; create a new check | Append another review on the SAME check; latest review wins                          |
| Departure          | Copy departure into screening check      | Receive current flight departure data; do not copy it into the immutable check       |
| Re-screen triggers | No `entry_change`                        | Support `booking`, `check_in`, `new_entry`, `entry_change`, `identity_change`        |

The Figma layout and concise interface copy are retained. The demo-clock banner and implementation details are kept out of the page. History uses the design's compact `By <reviewer>` text; clicking it expands the complete original note without changing or dropping any reviews. Simulation times, counts, and sorting remain data-driven rather than hardcoded to a screenshot.

Small copy differences are intentional where the design abbreviates a rule: the queue does not say held checks always come first (nearest-departure sorting is authoritative), the short Probable legend also mentions passport matches, and Strong/Probable flags never claim check-in is held. Longer rule explanations are available as tooltips rather than extra page sections. Audit/authority wording follows the Figma prototype; these integrations remain mocked as documented below.

## Frontend behavior

- `screening-model.ts` derives presentation from an immutable check outcome (`held`, `flagged`, `clear`) plus separate reviews (`confirmed`, `false_positive`). A review does not overwrite the check, snapshot, or earlier reviews.
- Pending means a held/flagged check with NO review. Clear checks never appear as reviewable. The latest timestamp determines the effective decision; when timestamps tie, the last appended review wins.
- `Needs review` and explicit departure sort order ALL pending checks by current `flight.departureAt`; a later held check does not jump ahead of an earlier flagged check. Waiting sort uses complete timestamps across days. Strongest match sorts Strong, Probable, Weak, with departure as tie-breaker.
- `Decided today` uses the latest review date in Asia/Bangkok, rather than including all historical decisions.
- `MatchNotice` uses the received match reason and original outcome, not the masked passport or match level alone. A flagged Strong/Probable case is NOT described as held. Only the check-in trigger may hold; booking never blocks purchase.
- A nonblank note and explicit passport-comparison confirmation are required by the form. Creating a review appends to the same check. History shows the old and new decisions, reviewers, and notes.
- Confirmation simulates a denied check-in and a Feature 13 authority notification. A false positive clears ONLY this check; the UI does not promise that other matches are clear. Prior notification history stays visible when a decision is corrected.
- One fixture simulation clock is used everywhere: **05 Nov 2026, 08:30 Asia/Bangkok**. Departure text, waiting times, 3-hour highlighting, decision dates, and newly appended reviews use that clock, not the user's real date. This is a fixed frontend fixture, to be replaced by the shared simulation clock during integration.
- URL state persists status, search, sort, and selected review. Filters are actual links. Refresh/Back/Forward/open-in-new-tab work. Typing replaces the current history entry, rather than creating one per keystroke.

Examples: `/screening-queue?status=held`, `?status=flagged`, `?status=decided`, `?status=needs-review&q=ARTHIT&sort=match&review=C-F735`.

## Boundaries for later integration

This change is **frontend only**, limited to the existing Screening Queue / Screening Review scope. Mock reviews are in memory and reset on reload. No backend route, Prisma schema, migration, seed, database contents, or authentication behavior is changed. Watchlist management and customer/passenger profile screens are separate work.

- Matching and thresholds are backend responsibilities. This UI only renders fixture results and match reasons; it does not implement trigram matching or treat the last four passport digits as identity equality.
- False-positive memory must eventually be enforced by identity + flight + watchlist entry, never passenger ID alone. If either side has a passport, use the passport/nationality identity rule; fall back to normalized name/DOB only when neither has a passport. This UI does not emulate that matching service or automatically clear other checks.
- Flight times should come from the joined Feature 2 flight in the future response. `flight.departureAt` is a current flight summary, not a copied screening timestamp.
- Append-review requests will map to `POST /security/screenings/:id/reviews`; pending/detail reads to `GET /security/screenings` and `GET /security/screenings/:id`. These endpoints are documented only; no requests are made here.
- The reviewer name and authority-notification timestamp are explicitly simulated. Backend must supply the authenticated reviewer and record Feature 13 / Feature 15 effects. Real auditing, notification delivery, security-role authorization, identity normalization, idempotency, and check-in fail-closed behavior remain backend work.
- Existing authentication stays centralized. The UI is not security-role enforcement. Production backend authorization is still required as the supplied requirements specify.

## Validation

From `apps/staff-web`:

```sh
node --experimental-strip-types --test src/features/security-screening/screening-model.test.ts
npm run lint
npm run format:check
npm run build
```

The model tests cover immutability, corrected reviews and history, latest-review ordering, validation, clean checks, cross-day dates, departure ordering, other sorts, simulation time, and trigger labels. `format:check` still reports pre-existing formatting issues elsewhere in the scaffold; feature files are checked separately without reformatting unrelated files.

Visual reference: Figma file `Vrt9ABsEitS4LGzHS4jXEC`, section `2559:10535` (desktop 1440px, mobile 393px). Original local SVGs and fonts remain in `assets/`.
