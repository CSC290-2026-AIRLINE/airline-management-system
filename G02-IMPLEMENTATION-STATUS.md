# G02 Feature 2: implementation status

Snapshot taken 23 Oct 2026 from branch `feat-02-aircraft-operations` at `f089f82`, compared with the Feature 2 Iteration-03 specification.
Updated later the same day for the uncommitted staff-web work (demo data removed) and the TEMP-NO-LOGIN fallback, which is on again for
local testing. Details of the staff-web change: [`docs/feature-2/g02-staff-web-no-demo-data.md`](docs/feature-2/g02-staff-web-no-demo-data.md).

- **Side A** (Nontouch): master data, schedule board, schedule builder, and the staff-web pages.
- **Side B** (Kewalin): operations, disruptions and conflicts. B's code is in `apps/backend/src/modules/flight-scheduling/operations/` and `dto/operations.dto.ts`.

## 1. Completed

These are implemented, committed and covered by unit tests. Every route below needs a signed-in staff user in the committed code. The
uncommitted TEMP-NO-LOGIN fallback opens them for local testing (see the TEMP-NO-LOGIN check below). They are under `/api/flight-scheduling`.

### Side B (backend)

| Area | Routes / code | Verified by |
|---|---|---|
| Flight events + outbox | `FlightEventWriter.append` writes the event and its outbox row in the same transaction. `FlightEventPublisher` publishes after commit. A failed delivery stays in the outbox (`published_at` null, `attempts`, `last_error`) | `flight-event-writer.spec.ts`, `flight-event-bus.spec.ts`. Locks were checked against a real DB in an earlier rolled-back run |
| Locks | Aircraft advisory lock (sorted), then flight `SELECT … FOR UPDATE` | `flight-event-writer.spec.ts` |
| Delay / divert / cancel | `POST flights/:id/delay`, `/divert`, `/cancel`. Returns 422 for an unknown reason or airport, and 409 after departure | `flight-operations.service.spec.ts` |
| Holding | `POST flights/:id/hold` and `/hold/end`. Allowed only in the air. Over `holding_limit_minutes` returns 409 with `proposal: 'divert'` | `flight-operations.service.spec.ts` |
| Change aircraft | `PUT flights/:id/aircraft` runs the feasibility gates. It returns 502 until F9 is connected (see Blocked) | `aircraft-feasibility.service.spec.ts` |
| Feasibility gates | `checkAircraftFeasibility`, `findDelayCascade`, `findPositionBreaks`. `assertGatesPass` returns 409 when a gate fails and 502 when a check is incomplete (no bypass) | `aircraft-feasibility.spec.ts` |
| Conflict detection | A delay opens a `cascade` conflict. A diversion opens an `aircraft_position` conflict on the next link. Other events only update or supersede an open conflict | `cascade-detector.spec.ts`, including the dismissed-conflict regression |
| Conflicts API | `GET conflicts`, `GET conflicts/:id/options` (options carry `blocked_by`), `POST conflicts/:id/resolve` | `conflict.service.spec.ts` |
| Event history | `GET flights/:id/events` | `flight-operations.service.spec.ts` |
| Confirm (single flight) | `POST flights/confirm` | `flight-confirm.service.spec.ts` |
| Staff actor | A request with no user returns 401. A user with no staff row returns 403 | `staff-actor.service.spec.ts` |
| No public routes | No B route is `@Public()`, and the global JWT guard rejects missing or forged tokens | `flight-operations.controller.spec.ts` (fails on purpose while TEMP-NO-LOGIN is on) |

### Side A (backend, committed by Nontouch)

| Area | Routes (under `/api/flight-scheduling`) |
|---|---|
| Airports | `GET/POST airports`, `GET/PUT airports/:iata` |
| Airport fees | `GET/POST airport-fees`, `PUT airport-fees/:id` |
| Routes | `GET/POST routes`, `GET/PUT routes/:id` |
| Timetables | `GET/POST timetables`, `GET/PUT timetables/:id` |
| Schedule builder | `POST schedule-builder/preview` |
| Settings | `GET/PUT settings` |
| Congestion | `GET/POST congestion`, `DELETE congestion/:id` |
| Flights | `GET flights`, `GET flights/:id`, `GET disruption-reasons` |

## 2. In progress

| Item | State | Evidence |
|---|---|---|
| Confirm | Confirms one flight only. The spec wants a batch (`flights[]`, each with an approved `approval_id`, 207 for mixed results) | `flight-confirm.service.ts`. Spec "Checks, approval and confirm" |
| Conflict resolutions | Only `cancel_refund` works end to end. `change_aircraft` is unavailable until F9 is connected. Rescheduling returns 422 because the approval tables are missing. Rebooking with a partner returns 422 because `partner_airline_route` is missing | `conflict.service.ts` (`blocked_by`) |
| Dismiss conflict | The flow works, but it returns 502 and leaves the conflict open until F15 audit exists | `audit-sink.ts` (`PendingAuditSink`) |
| Simulation clock | `InterimMachineClock` behind `FLIGHT_CLOCK` is a placeholder. It stays until F1 ships, as agreed | `operations/flight-clock.ts` |
| Staff-web wiring (uncommitted) | `mocks/` is deleted and no screen shows demo data. These now call B's real endpoints: Conflicts (list, options, resolve, dismiss), Flight detail (delay, cancel, event history, the flight's conflicts) and the schedule board's batch delay. Parts that wait on another feature keep their UI but are hidden behind flags in `connected.ts` (all `false`) | `features/flight-scheduling/connected.ts`, `pages/ConflictsPage.tsx`, `pages/FlightDetailPage.tsx`, `components/BatchActions.tsx`. Lint and build pass; not yet opened in a browser |
| Hidden staff-web parts | Hidden until their dependency exists: F1 clock, F9 aircraft (change and assign aircraft), gate and availability checks, approvals, approver console, approval policy, impact, partner airlines, the all-flights disruption log and the full cost estimate. Their types in `types.ts` are assumptions marked `ponytail:` | `connected.ts` flag table in the staff-web note |

## 3. Not done (in the spec, not in the code)

- [ ] `POST /flights/check`: run the gates for unsaved flights
- [ ] `GET /flights/{id}/availability?dep_at=`
- [ ] `POST /approvals`, `GET /approvals`, `GET /approvals/{id}`, `POST /approvals/{id}/respond`, `POST /approvals/{id}/revise`
- [ ] Approval policy: `GET/PUT /airports/{iata}/approval-policy`
- [ ] `POST /flights/{id}/reschedule`: returns 409 when approval is missing
- [ ] `GET /flights/{id}/cost-estimate`
- [ ] `GET /flights/{id}/impact`: counts of affected bookings, crew, bags and cargo (502 when another feature is unreachable)
- [ ] `POST /flights/batch/aircraft`, `POST /flights/batch/delay` (207 mixed results)
- [ ] `GET /partner-airlines`
- [ ] Replay of unpublished outbox events. They are kept, but nothing re-sends them yet
- [ ] `aircraft_unavailable` conflicts from F9 status changes
- [ ] Departed/arrived transitions driven by the clock
- [ ] Spec error shape `{ error: { code, message, details? } }`. All modules use Nest's default shape
- [ ] Flight-number format validation that uses `airline_code`, which is not seeded yet (`timetable.service.ts:98`)

## 4. Blocked / waiting

| # | Waiting for | Owner | Effect today |
|---|---|---|---|
| 1 | F9 aircraft API: availability with the failing rule, `max_range_km`, minimum turnaround, seats | F9 | Change aircraft and the gates return 502. The `change_aircraft` option is unavailable. `origin/feat-09-aircraft-management` has frontend drafts only |
| 2 | `schedule_approval`, `schedule_approval_offer` tables | DB team | Confirm returns 409. Reschedule through resolve returns 422. Section 3's approvals work cannot start |
| 3 | `partner_airline_route` table and seed | DB team (the seed owner is an open question) | Rebooking with a partner returns 422 |
| 4 | `airport_approval_policy` table | DB team | The approval policy API cannot be built |
| 5 | F15 audit API | F15 | Dismiss returns 502 |
| 6 | F1 simulation clock and departed/arrived jobs | F1 | The interim clock is used. When F1 ships, move the `FLIGHT_CLOCK` call sites and delete `flight-clock.ts` |
| 7 | Disruption reason codes under the 7 categories | G02 with F13/F14, seeded by DB team | Delay, divert, cancel and hold return 422 (there are no reason rows) |
| 8 | Test data: staff, aircraft and flights | DB team and F9 | No end-to-end test in the web app is possible |

## 5. Open questions

- [ ] Cascade "down the day": the delayed flight's service day, or the aircraft's whole chain?
- [ ] Holding: should a hold raise a cascade? Can a hold be extended? Can a flight be diverted twice?
- [ ] Should a position conflict be raised after an aircraft change or cancel? The spec lists no trigger for it, so none is raised today.
- [ ] Error format: should the spec shape apply project-wide? This needs the Dev and Platform leads.
- [ ] With A:
  - Who owns confirm and reschedule?
  - What should the batch confirm look like?
  - Schedule builder's confirm must also take `lockAircraft`.
- [ ] With A: path names differ from the spec:

  | Code | Spec |
  |---|---|
  | `settings` | `/flight-settings` |
  | `timetables` | `/patterns` |
  | `schedule-builder/preview` | `/flights/generate` |
  | `airport-fees` | `/airports/{iata}/fees` |
  | `congestion` | `/airports/{iata}/congestion` |

  Keep these names or align them with the spec? The spec says field names are proposals until the week 3–4 lock.
- [ ] Who seeds `partner_airline_route`?

## 6. Tests and commits

### Results (run 23 Oct 2026 on this branch)

| Check | Result |
|---|---|
| `npm run test -w apps/backend` | **307 / 312 passed, 22 / 23 suites.** The 5 failures are all in `flight-operations.controller.spec.ts`, which checks that no operations route is public. They fail on purpose while TEMP-NO-LOGIN is on. Before TEMP was re-added: 312 / 312 |
| `npm run lint -w apps/backend` | pass, no output |
| `npm run build -w apps/backend` | pass |
| Prettier on B's files (`operations/`, `dto/operations.dto*.ts`) | pass |
| `npm run lint -w apps/staff-web` | pass |
| `npm run build -w apps/staff-web` (includes `tsc`) | pass |
| Prettier on the changed staff-web files | pass |
| `format:check` on the whole app | Not used as evidence: about 65 files fail because of CRLF in the local working copy only. Their committed content is LF |

The strict-gate behaviour after the last change is covered by unit tests only. It was not re-run end to end against the database. The
staff-web changes were not checked in a browser.

### Commits

The branch is 37 commits ahead of `origin/dev` (33 by Nontouch, 4 by Kewalin) and is pushed to `origin/feat-02-aircraft-operations`.

| Commit | Author | Summary |
|---|---|---|
| `f089f82` | Kewalin | feat(g02): add conflicts, confirm and operations API |
| `466a9d9` | Kewalin | feat(g02): add delay, diversion, cancel and holding |
| `2221351` | Kewalin | feat(g02): add aircraft feasibility check |
| `bd246c9` | Kewalin | feat(g02): add flight event factory and outbox |
| `781b405` | Nontouch | chore(g02): TEMP open schedule board list endpoints without sign-in |

B's 4 commits change 29 files (+4093 / −1). The only A file B changed is `flight-scheduling.module.ts`, to register B's providers and controller.

### Uncommitted

| Path | Status |
|---|---|
| `docs/feature-2/g02-side-b-status.md` | Untracked. An earlier blockers note that overlaps this report. Keep it or delete it |
| `docs/feature-2/g02-staff-web-no-demo-data.md` | Untracked. Note for Nontouch about the staff-web change |
| `G02-IMPLEMENTATION-STATUS.md` | Untracked (this file) |
| `apps/staff-web/src/features/flight-scheduling/` | 19 files modified, `connected.ts` added, `mocks/` deleted, `MockNotice.tsx` renamed to `NotConnected.tsx`. Almost all are side A files |
| `apps/staff-web/src/routes/_authenticated.tsx` | TEMP-NO-LOGIN only (platform file) |
| `apps/backend/src/modules/flight-scheduling/` | 10 files, TEMP-NO-LOGIN only |

## TEMP-NO-LOGIN check

**The fallback is on again for local testing, and it must be removed before any commit.** It is uncommitted. B's 4 commits contain none of it.
`git grep "TEMP-NO-LOGIN"` lists 12 lines in these files:

| File | What it does |
|---|---|
| `apps/staff-web/src/routes/_authenticated.tsx` | `TEMP_NO_LOGIN` flag skips the login redirect, so every page opens signed out |
| `airport-fee`, `airport`, `congestion`, `flight-scheduling`, `route`, `schedule-builder`, `settings`, `timetable` controllers (backend `flight-scheduling/`) | Class-level `@Public()`, so every route accepts requests without a token |
| `operations/flight-operations.controller.ts` | The same class-level `@Public()` on B's routes |
| `operations/staff-actor.service.ts` | When nobody is signed in, writes act as the staff row named by the `F2_TEMP_NO_LOGIN_STAFF_CODE` shell variable. Without it, writes still return 401 |

Remove all of it before committing. These checks must then pass:

- [ ] `git grep -n "TEMP-NO-LOGIN"` prints nothing.
- [ ] `npm run test -w apps/backend` is back to 312 / 312.

The schedule board also depends on it: its batch delay uses a plain fetch because the board is outside `routes/_authenticated/`. Move it
under `_authenticated/` when TEMP is removed.

A separate temporary bypass is committed by A in `781b405`. It **must be removed by A before the PR**:

  | File | Line | Route |
  |---|---|---|
  | `flight-scheduling.controller.ts` | 10 | `@Public()` on `GET flights` |
  | `flight-scheduling.controller.ts` | 17 | `@Public()` on `GET disruption-reasons` |
  | `route.controller.ts` | 10 | `@Public()` on `GET routes` and `GET routes/:id` |

## 7. Next steps

1. [ ] Remove the uncommitted TEMP-NO-LOGIN fallback (12 lines) before any commit, and ask A to remove the 3 TEMP `@Public()` markers
   (`781b405`) before any PR to `dev`.
2. [ ] Send the table requests to the DB team: `schedule_approval`, `schedule_approval_offer`, `partner_airline_route`, `airport_approval_policy`, plus disruption reason seeds and test data.
3. [ ] Agree with A who owns confirm and reschedule, the batch confirm shape, and the path names. Then build the batch confirm.
4. [ ] Bring the open questions in section 5 to the team and the Dev leads.
5. [ ] Build the work that has no blocker: `GET /partner-airlines` (the spec says the list is mocked), outbox replay, and `POST /flights/batch/delay`.
6. [ ] Review the staff-web change with A before either of us commits, using
   `docs/feature-2/g02-staff-web-no-demo-data.md`. Then:
   - [ ] Move the schedule board under `_authenticated/`.
   - [ ] Open the pages in a browser and check them.
7. [ ] When F9, F15 and F1 ship:
   - [ ] Connect `AircraftDirectory`, `AuditSink` and the clock.
   - [ ] In staff-web, set the matching flags in `connected.ts` and replace their stubs.
   - [ ] Run the database end-to-end check again.
8. [ ] Before the PR:
   - [ ] Rename the branch to `feature/g02-…`.
   - [ ] Split the work into PRs of about 400 lines.
   - [ ] Re-run lint, test and build.
