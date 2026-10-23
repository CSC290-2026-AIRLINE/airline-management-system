# G02 Feature 2, side B: blockers and open items

Status as of 23 Oct 2026. Branch `feat-02-aircraft-operations`, based on `781b405`. Code lives in
`apps/backend/src/modules/flight-scheduling/operations/` and `dto/operations.dto.ts`.

## Works now

These need a signed-in staff user and at least one row in `disruption_reason` (none exist yet, see blocker 5).

- Delay, diversion, cancel with refund
- Hold and end hold, limited by `flight_setting.holding_limit_minutes`
- Conflict detection: `cascade` after a delay, `aircraft_position` after a diversion
- Conflict list, options, and resolving with `cancel_refund`
- Event history per flight
- Events saved with their outbox row and published after commit

## Blocked by other teams

| # | Waiting for | Owner | What we need | Current behaviour |
|---|---|---|---|---|
| 1 | F9 aircraft API | F9 | Availability route that returns the failing rule (grounded, maintenance), `max_range_km`, type minimum turnaround, seat counts | Change aircraft, confirm and reschedule return **502**; the `change_aircraft` option is unavailable |
| 2 | `schedule_approval` and `schedule_approval_offer` tables | DB team | Tables as in the Iteration-03 DDL | Confirm returns **409**; reschedule through resolve returns **422** |
| 3 | `partner_airline_route` table and seed data | DB team (the spec asks who seeds it) | Table of `(partner_airline, route_id)` | Rebook with partner returns **422** |
| 4 | F15 audit API | F15 | An API to write an audit entry | Dismissing a conflict returns **502** |
| 5 | Disruption reason codes | Our team with F13/F14, seeded by the DB team | Codes under the 7 fixed categories: weather, technical, crew, air_traffic_control, security, airport_operations, other | Delay, divert, cancel and hold return **422** |
| 6 | Test data | DB team and F9 | Staff, aircraft and flight rows | Cannot test end to end in the web app |
| 7 | Simulation clock and departed/arrived jobs | F1 | A clock service, and a job that writes departed/arrived | Interim machine clock behind `FlightClock` (kept on purpose). When F1 ships, move the 9 call sites to F1's clock and delete `operations/flight-clock.ts` and the `FLIGHT_CLOCK` provider |

Checked 23 Oct: `origin/feat-09-aircraft-management` only has frontend drafts (fleet, aircraft types, seat map,
readiness). No backend API yet.

## Questions for the team

1. **Cascade:** does "walks … down the day" mean the delayed flight's service day, or the whole chain of the aircraft?
2. **Holding:** should a hold also raise cascades? The spec mentions cascades for delays only. Can a hold be extended,
   and can a flight be diverted twice?
3. **Gaps after an aircraft change or cancel:** should a position conflict be raised? The spec does not list these as
   triggers, so none is raised today.
4. **Error format:** the spec says `{ error: { code, message, details? } }` across the project, while every module
   uses Nest's default shape. This needs a project-wide decision from the Dev and Platform leads.
5. **With A (Nontouch):**
   - Who owns confirm and reschedule?
   - The spec's confirm is a batch (`flights[]`, 207 response); ours confirms one flight.
   - The direct `POST /flights/{id}/reschedule` is not built. The spec says it returns **409** when approval is
     missing, while resolve returns **422**. Both match the spec.
   - Schedule Builder's confirm must take `lockAircraft` too.

## Before opening a PR

- A's committed `@Public()` on `GET flights`, `GET disruption-reasons` and `GET routes` (commit `781b405`) must be
  removed by A.
- The only file of A's we changed is `flight-scheduling.module.ts` (registered B's providers and controller). Tell A to
  avoid merge conflicts.
- The branch name does not follow `<type>/<team-id>-<desc>`, for example `feature/g02-aircraft-operations`.
- The change is about 4,000 lines (about half tests). The team target is about 400 per PR, so split it into several PRs.
- The temporary no-login fallback has been removed, so testing needs a real staff sign-in.
- Until F9 and the approval tables exist, `cancel_refund` is the only resolution that works.
