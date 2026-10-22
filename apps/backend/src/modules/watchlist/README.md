# Watchlist API (Feature 7)

All routes start with `/api/watchlist`. They require the existing backend JWT authentication and an enabled, non-deleted staff account whose role is `security`. An `admin` role alone does not grant access. Actor IDs are taken from the authenticated user and database, never from request bodies.

| Method | Route            | Purpose                                                 |
| ------ | ---------------- | ------------------------------------------------------- |
| GET    | `/`              | Search and filter masked entries                        |
| GET    | `/nationalities` | Supported ISO 3166-1 alpha-2 country codes              |
| GET    | `/:id`           | Read one entry, including its full passport for editing |
| POST   | `/`              | Add an active entry                                     |
| PATCH  | `/:id`           | Edit entry fields without changing its status           |
| POST   | `/:id/clear`     | Clear an active entry with a required reason            |

## Requests

List query parameters: `search`, `status` (`active`, `cleared`, `all`; default `active`), `listType` (`wanted`, `travel_ban`, `no_fly`, `all`; default `all`), `limit` (1–100; default 20), and `cursor` (the previous response's `nextCursor`). Entries are sorted by listed date descending, then ID descending. The response is `{ items, nextCursor }`. Active filtering returns active records only.

Create body:

```json
{
  "firstName": "SOMSAK",
  "lastName": "JAIDEE",
  "dateOfBirth": "1985-07-02",
  "nationality": "th",
  "passportNumber": "AA1239037",
  "listType": "wanted",
  "issuingAuthority": "Example authority",
  "reason": "Example reason"
}
```

Names, list type, and issuing authority are required. Date of birth, nationality, passport, and reason are optional; blank strings become `null`. Dates must be valid `YYYY-MM-DD` values and cannot be in the future. Names use Latin characters and are normalized to uppercase. Nationalities use lowercase alpha-2 codes. Passports are uppercase alphanumeric values (maximum 20 characters); spaces and hyphens are removed. Submit the full passport, not masking dots.

PATCH accepts the same fields independently. Omitted fields remain unchanged; optional fields can be cleared with `null`. Empty updates and unknown fields are rejected. Status, timestamps, and staff IDs cannot be supplied by callers.

Clear body: `{ "reason": "Reason for clearing" }`. Clearing preserves the record, stores the authenticated staff ID and timestamp, and changes status to `cleared`. Clearing an already cleared entry returns 409. There is no delete or reactivation endpoint.

## Privacy and audit

List responses expose `passportLast4` and `passportMasked`, never the full passport. Detail and write responses include `passportNumber` for the authorized editing flow. Sensitive reads and writes append to the existing `audit_log`; writes and audit inserts share a database transaction. Audit snapshots contain limited metadata and passport last four characters, not full passport numbers or full identity snapshots. The audit actor is the user ID; creation and clearing staff references use the staff ID.

## Time and integrations

`WatchlistClock` is the injection point for business time. `SystemWatchlistClock` currently returns real UTC time for listed, cleared, and audit occurrence timestamps. Replace its module binding when the shared simulation clock becomes available. Database record timestamps continue using real time.

Upcoming-flight re-screening is **not connected**: no shared screening service is currently available. Create and update responses explicitly return `screeningStatus: "not_connected"`; they must not be presented as confirmation that flights were re-screened. The existing public frontend preview still uses mock data and has not been connected to these authenticated APIs.

No Prisma schema changes, migrations, or database resets are included.

## Local development and verification

Use Node.js 24 or newer. From the repository root, start the existing database with `npm run db:up`, then run `npm run start:dev -w apps/backend`. Existing environment configuration is required. Open Prisma Studio with `npm run db:studio`. Do not reset or seed an existing database just to use this module.

Run module tests with `npm run test -w apps/backend -- --runInBand modules/watchlist`, or all backend tests with `npm run test -w apps/backend -- --runInBand`. Tests use mocked database and token verification; they do not verify a live PostgreSQL transaction rollback or real Clerk authentication.
