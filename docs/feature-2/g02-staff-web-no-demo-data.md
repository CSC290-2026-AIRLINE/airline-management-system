# G02 staff-web: demo data removed, unfinished parts hidden

Written 23 Oct 2026 by Kewalin (side B) for Nontouch (side A). Branch `feat-02-aircraft-operations`. This work is now committed on `feat-02-flight-schedule-and-network-ops`.

## Summary

- The `mocks/` folder (`cross-feature.ts`, `network-ops.ts`) is deleted. No screen shows Figma sample data any more.
- No UI was lost. Every table, form and button is still in the code. Parts that wait on another feature or a missing table are **hidden** behind a flag in the new file `connected.ts`.
- The screens that side B's backend already serves now call the real endpoints.
- Checked: `npm run lint -w apps/staff-web`, `npm run build -w apps/staff-web` (includes `tsc`) and Prettier on the changed files all pass. Not yet opened in a browser.

## How hiding works: `connected.ts`

`apps/staff-web/src/features/flight-scheduling/connected.ts` holds one flag per unfinished part. `false` today: `simClock`, `approvalMode`, `impact`, `partnerRoutes` and `eventLog`. The others are `true` now that their APIs exist.

| Flag | Waiting for | Hidden while `false` |
|---|---|---|
| `simClock` | F1 simulation clock | Clock chip in `TopBar` |
| `aircraft` | `GET /aircraft` (connected; reads Feature 9's tables until F9 has an API) | Change aircraft (flight detail, batch bar, conflicts); Assign aircraft and the Aircraft column (Generate flights) |
| `gates` | `POST /flights/check` (connected) | Check gates button and Check result column (Generate flights) |
| `availability` | `GET /flights/:id/availability`, `POST /approvals`, `POST /flights/:id/reschedule` (connected) | "Check another time or reschedule" card on the flight detail page |
| `approvals` | `POST /approvals`, `POST /approvals/:id/revise`, `POST /flights/confirm` (connected) | Request approval and Confirm buttons; Approval column (Generate flights) |
| `approvalMode` | A settings API for `approval_mode` | Approval mode card in Settings |
| `approvalQueue` | `GET /approvals`, `POST /approvals/:id/respond` and `/revise` (connected) | Approvals and Approver console page bodies |
| `approvalPolicy` | `GET/PUT /airports/:iata/approval-policy` (connected) | Approval policy table and edit form |
| `impact` | `GET /flights/:id/impact` | Impact numbers on the Conflicts resolve card |
| `partnerRoutes` | `partner_airline_route` table | Partner airlines column (Routes); Rebook with partner option |
| `eventLog` | An endpoint that lists events across all flights | Disruption log table and filters |
| `costEstimate` | `GET /flights/:id/cost-estimate` (connected; revenue from F4 and F3b is listed as pending) | Cost table on the flight detail page; without it only the fees are listed |

The same file also has:

- **Empty lists:** `partnersFor()`, `simClockNow()` and `openConflictCount()`, which return empty or `null`.
- **No stubs are left that refuse:** `checkGates`, `requestApproval`, `requestReschedule` and `confirmApproved` were replaced by the real calls (see `generate-flights.ts` and the pages).

Pages whose whole body is hidden (Disruption log) show a `<NotConnected>` line saying what is missing. `MockNotice` was renamed to `NotConnected`.

### To switch a part on

1. Set its flag to `true` in `connected.ts`.
2. Replace its stub or empty list with the real API call.
3. Remove the page's `<NotConnected>` line.
4. Check the shapes in `types.ts` (see below) against the real response.

## Now using side B's real API

All of these are under `/api/flight-scheduling`.

| Screen | Endpoints |
|---|---|
| Conflicts | `GET conflicts` and `GET conflicts/:id/options` (options the backend cannot apply yet show its `blocked_by` reason), `POST conflicts/:id/resolve`, `POST conflicts/:id/dismiss` |
| Flight detail | `POST flights/:id/delay`, `POST flights/:id/cancel`, `GET flights/:id/events` (event history), `GET conflicts?flight_id=` (open conflicts), `PUT flights/:id/aircraft` (hidden until F9) |
| Schedule board batch bar | `POST flights/:id/delay` for each selected flight, in departure order. There is no batch endpoint yet. `PUT flights/:id/aircraft` is hidden until F9 |

What works end to end today:

- Delay
- Cancel with refund
- Resolving a conflict with `cancel_refund`

Dismiss returns 502 until F15 audit exists, and the page shows that error.

## Files changed

| File | Change |
|---|---|
| `connected.ts` | **New.** Flags, empty lists, stubs |
| `types.ts` | Conflict, event and options types; types for the hidden parts; `DISRUPTION_CATEGORIES` moved here |
| `components/NotConnected.tsx` | Renamed from `MockNotice.tsx` |
| `components/BatchActions.tsx` | Real delay and aircraft calls; takes a `fetcher` prop; the board reloads after a batch |
| `components/TopBar.tsx`, `components/StaffShell.tsx` | Clock chip and conflict badge hidden while their source is `null` |
| `hooks/useResource.ts` | Added `reload()` |
| `hooks/usePagedList.ts` | Paged list hook (no longer exports `publicFetch`) |
| `pages/*.tsx` | Mocks replaced with real calls, or hidden by flags: Approval policy, Approvals, Approver console, Conflicts, Disruption log, Flight detail, Generate flights, Routes, Schedule board, Settings |
| `flight-scheduling.css` | Selector renamed to `Partner airlines` (dropped "(demo)") |
| `CLAUDE.md`, `README.md` (feature) | Rule changed from "use mocks" to "no demo data; hide behind `connected.ts`" |

## Please check, Nontouch

- [ ] **You own these files.** Almost all of them are side A code. Review before either of us commits, so we avoid merge conflicts.
- [ ] **The rule in the feature `CLAUDE.md` changed.** Mocks in `mocks/` are no longer allowed.
- [ ] **The types for hidden parts are assumptions.** `ApprovalRequest`, `ApproverRequest`, `ApprovalPolicy`, `DisruptionLogRow`, `CostInputs`, `FlightImpact`, `AircraftOption`, `GateResult` and `RescheduleCheck` are marked `ponytail:`. They describe what the screens need, not an agreed contract.
- [ ] **Picking an offered slot on Generate flights** sends a revision of the request (`POST /approvals/:id/revise`); the backend approves it at once because the approver already offered that time.
- [x] **The schedule board is under the signed-in layout.** It lives in `routes/_authenticated/schedule-board.tsx` and uses `useAppAuth().fetchWithAuth`. The open-conflict badge and stat can read `GET /conflicts` once `openConflictCount()` in `connected.ts` is wired.

## Sign-in bypass is removed

The temporary no-login fallback (`TEMP-NO-LOGIN`, the class-level `@Public()` markers and the staff-actor fallback) is gone from the tree. Testing needs a real staff sign-in. This command prints nothing:

```bash
git grep -n "TEMP-NO-LOGIN"
```
