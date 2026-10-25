# Screening API (G10 / Feature 7)

This module implements matching, immutable screening checks, queue/detail reads and append-only review decisions. It is registered in `AppModule`. The staff Screening Queue consumes these APIs. Automatic cross-feature workflows are not included.

## Authentication and access

All HTTP routes use the existing global JWT guard and `@CurrentUser()`. Every operation additionally requires a non-deleted staff account, linked to a non-disabled/non-deleted staff user, with role code `security`. An `admin` role alone is insufficient. Actor IDs and business timestamps are derived on the server. No login, token exchange or Clerk behavior is replaced.

Feature-local pipes validate inputs without adding dependencies, as requested. Unknown fields, malformed UUIDs, invalid options, excessive page sizes, empty notes and forged actor/time fields are rejected.

## Routes

All paths below include the existing `/api` prefix.

| Method | Path                                           | Purpose                                                       |
| ------ | ---------------------------------------------- | ------------------------------------------------------------- |
| POST   | `/api/screening/check`                         | Screen an existing passenger for an upcoming flight           |
| GET    | `/api/screening/status/:passengerId/:flightId` | Aggregate stored clearance for the current passenger identity |
| GET    | `/api/security/screenings`                     | Paginated queue and counts                                    |
| GET    | `/api/security/screenings/:id`                 | Snapshot comparison, reviews, history and booking summary     |
| POST   | `/api/security/screenings/:id/reviews`         | First decision or correction on the same check                |

### Create a check

```json
{
  "passengerId": "10000000-0000-4000-8000-000000000001",
  "flightId": "20000000-0000-4000-8000-000000000001",
  "pnrId": "70000000-0000-4000-8000-000000000001",
  "triggerPoint": "check_in"
}
```

IDs are illustrative: the passenger and flight must exist. `pnrId` is optional because Feature 3b has no booking model here. The server reads identity from `passenger`; the caller cannot submit a score, match level, outcome or snapshot. Nationality must be present as a lowercase two-letter code. The identity owner remains responsible for validating country membership and normalizing identity values before storage. Cancelled, departed, arrived and past-departure flights are rejected.

The response contains `runId`, newly inserted `checkIds`, `reusedCheckIds`, `skippedEntryIds`, aggregate `outcome` (`clear`, `held`, `denied`), `now` and integration status. A run ID identifies this invocation; reused checks retain their original run IDs. Stable hits for `booking`, `check_in` and `new_entry` are reused. `entry_change` and `identity_change` permit new checks under the database's partial unique index; callers must not blindly retry these repeatable triggers after an uncertain response. Stable retries with changed passenger snapshots return 409 and require the appropriate identity-change workflow.

One new row is inserted per matched entry. A no-match check stores `none`/`clear` with no entry snapshot or similarity. If every match is already decided, the response references `skippedEntryIds` instead of creating duplicate hits. Matching, check inserts and the run audit share a serializable transaction. Concurrent conflicts return 409; no partial write is reported as successful.

### Matching and outcomes

`pg_trgm` and the database's `name_key(first, last)` compute **name similarity only**. Normalize to uppercase ASCII letters/digits, compare both passenger name orders against the entry, and keep the maximum PostgreSQL `similarity` score. A score of 0.67 is name similarity of 67%, not a probability that two records are the same person.

| Match    | Rule, in priority order                                |
| -------- | ------------------------------------------------------ |
| Strong   | Non-empty passport and nationality both equal          |
| Probable | Name score >= 0.5 and both DOBs present and equal      |
| Weak     | Name score >= 0.6 and DOBs different or either missing |
| None     | None of the above                                      |

The user-approved rules intentionally omit the passport-only Probable rule mentioned in the older frontend README. Gender is displayed but never used to match. Only active watchlist entries participate in a new match.

At `check_in`, Strong/Probable are `held`; Weak is `flagged`. At `booking`, `new_entry`, `entry_change` and `identity_change`, any match is `flagged`. None is always `clear`. Stored initial outcomes never change when reviewed.

Prior decisions use each check's highest revision, scoped to identity + flight + entry. Identity copies match by passport and nationality; only when neither identity has a passport do normalized name and DOB provide a fallback. An unchanged snapshot on the same passenger row is also recognized even when optional identity fields are missing. Different passports never fall back to a shared name/DOB. A confirmation on any applicable check denies clearance until that check is corrected. False positives suppress future duplicate hits, but do not silently review another pending check. Any remaining held check still blocks; unresolved weak flags do not.

### Queue

Query parameters:

- `status`: `needs-review` (default), `held`, `flagged`, `decided`.
- `sort`: `departure` (default), `waiting`, `match`.
- `q`: literal, case-insensitive search of snapshot full name or flight number/origin/destination; maximum 100 characters.
- `limit`: 1–100, default 20.
- `cursor`: opaque `nextCursor` from the previous response.

The response is `{ items, nextCursor, counts, now, timeZone }`. Counts are global across filters/search. Pending checks are held/flagged checks with no review. Decided today means the **highest-revision** review falls within today's Bangkok date. A correction changes the effective decision without increasing the number of checks counted.

Departure sort orders all rows by the current joined flight departure, not held-first. Waiting sort uses check occurrence then departure; match sort uses Strong, Probable, Weak then departure. UUID is the final tie breaker. Keyset ordering uses millisecond timestamps to match JavaScript date precision. Cursors are tied to status, sort, search and, for decided-today, the business date. Restart pagination after changing those values or after live flight changes to get a fresh ordering.

Queue items expose no full passports. `urgent` means pending, departure still ahead and within three hours. Timestamps are ISO UTC; `timeZone` is `Asia/Bangkok`.

### Details and privacy

Passenger and entry identity fields come from immutable `snap_*` columns, not live profiles. Similarity is the value stored when the matcher ran. The security-only, audited detail response includes full `passportNumber` and `passportLast4`; frontend should display only the last four, as requested. Do not infer passport equality from masked values.

Watchlist list type, authority, reason, listed date and status are labeled `current_metadata`: the schema does not snapshot these descriptive fields. History is scoped to the same passenger row, flight and entry. Reviews are ordered by revision, not simulated time. Historical rows backfilled by the DB migration contain migration-time identity values, which cannot reconstruct the original screening identity.

### Reviews

```json
{
  "decision": "false_positive",
  "note": "Compared the passport at the counter; the number differs.",
  "passportCompared": true,
  "expectedRevision": 0
}
```

Allowed decisions: `confirmed`, `false_positive`. A trimmed note of 1–2000 characters and explicit `passportCompared: true` are mandatory for both decisions. Use `expectedRevision: 0` for the first decision; to correct revision 3, send 3 and the server inserts revision 4. Missing/clear checks cannot be reviewed. A review cannot predate its check or previous review.

Only INSERT is used for checks/reviews. The `(screening_check_id, revision)` unique key and serializable transaction reject concurrent corrections with 409, `Decision changed, please reload`. The client must reload details before resubmitting; never automatically retry a decision with an updated revision.

The response includes the review, aggregate clearance and integration modes. It does not modify check-in or booking records. Earlier confirmations/notification timestamps remain in review history after corrections.

Passport acknowledgement is stored as a boolean in the review's transactional audit metadata because there is no review-table column. Details load this evidence for the selected check. Older reviews without evidence return `passportCompared: null`; they are never assumed to have been compared. Queue/history summaries do not load this evidence. Audit metadata omits full names, DOBs, passport numbers and free-text review notes; notes remain in the access-controlled review table. Sensitive reads also append an audit event. An audit failure fails the operation rather than returning success.

## Boundaries and mocks

- `ScreeningClock` currently uses real UTC time and can be rebound when a shared simulation clock exists. It does not use the frontend's fixed fixture date.
- `ScreeningCheckService` is exported through `ScreeningModule`. Its current methods require a security actor. Booking/check-in owners must agree a caller authorization contract before integration; no other role is implicitly authorized.
- HTTP errors are never clearance. Check-in callers must stop if matching fails and must not treat `not_screened` as clear. A status lookup alone is not a fresh check against the current watchlist; the check-in flow must call `check` with `check_in` before proceeding. Booking fail-open behavior and recording a skipped check belong to the future booking integration.
- Feature 3b uses `ScreeningBookingPort`. Three explicit demo PNR UUIDs ending in 1/2/3 (prefix `70000000-0000-4000-8000-`) return the frontend's Somsak/Arthit/Maya booking examples with `source: mock`. Unknown IDs return null fields with `source: not_connected`; no fake booking is written to the database.
- F13 uses `MockScreeningNotification`, records a simulated notification time and returns `notificationMode: mock`. No real authority is contacted. Replace it with transactional outbox delivery when that contract is available.
- F15 auditing writes to the existing `audit_log`; no F15 service or separate notification delivery is assumed.
- The Watchlist branch is not merged or modified. Automatic re-screen jobs and effects of clearing/editing entries on existing checks are not connected. Existing checks are preserved.
- The staff Screening Queue uses these APIs and selects the latest review by revision. Its isolated fixture/model tests remain separate from live data.
- No schema, migration, seed, auth configuration, package or lockfile changes are included.

## Verification

Use Node 24 (see the root project instructions). From the repository root:

```powershell
npm run test -w apps/backend -- --runInBand
npm run lint -w apps/backend
npm run format:check -w apps/backend
npm run build -w apps/backend
```

Tests exercise the actual global JWT guard with a mocked token verifier, role checks, boundary validation, outcomes, identity memory, immutable snapshots, per-entry clearance and revision conflicts. They require no Clerk account or live database. JWT test tokens are synthetic and not usable against the running application.

For an optional real PostgreSQL verification against the **default local Docker database only**, after applying the team's migrations:

```powershell
node apps/backend/src/modules/screening/verify-postgres.cjs --local-database
```

This creates synthetic passengers, watchlist entries, staff and flight dependencies inside one serializable transaction, exercises the actual services/SQL, and rolls back all rows. It uses the existing DbService, not an additional application client. PostgreSQL sequences can advance despite rollback. It does not reset, seed or migrate the database. It expects synthetic airport codes ZQA/ZQB to be unused and the standard local Compose connection; a collision fails and rolls back. It tests real matching, snapshots, queue sorts/search/pagination, revision handling, audit inserts and identity-copy memory. It does not prove real Clerk login, notification delivery or simultaneous requests from separate database connections. Manual authenticated API testing still requires a legitimate security account issued by the existing auth flow.

## Commit organization

1. `feat(g10): add screening matching and clearance rules`
2. `feat(g10): create screening checks with identity snapshots`
3. `feat(g10): add screening queue and detail queries`
4. `feat(g10): add screening decisions and review revisions`
5. `feat(g10): expose screening APIs and add verification guide`

Each commit was checked with backend tests and a build before committing. The final commit registers the APIs in AppModule. No schema, migration or dependency changes are included.
