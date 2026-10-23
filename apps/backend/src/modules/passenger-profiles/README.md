# passenger-profiles (G07)

Staff-facing read of passenger profiles, the staff identity correction, and creating a
passenger record.

`docs/backend-structure.md` names this module but specifies no endpoints for it.
This file is the contract; **the frontends and the Admin Console team treat it as
the source of truth for these routes.** Changing a shape here is a
cross-module contract change (backend rule 6), so discuss it before editing.

## Routes

All four sit behind the global `JwtAuthGuard`, so callers need a Bearer access
token. None is `@Public()`.

Paths follow the Feature 7 Artifact's route table, which mounts these under
`staff/`; the global `/api` prefix supplies the leading `/api`. Writes use
`POST` to create and `PUT` to update — the Artifact specifies no `PATCH`.

| Method | Path                                 | Purpose                                                |
| ------ | ------------------------------------ | ------------------------------------------------------ |
| `POST` | `/api/staff/passengers`              | Create a passenger with no account behind it           |
| `GET`  | `/api/staff/passengers`              | Search and page through passengers and account holders |
| `GET`  | `/api/staff/passengers/:id`          | One profile, with the links that belong to it          |
| `PUT`  | `/api/staff/passengers/:id/identity` | Staff identity correction, with an audit trail         |
| `GET`  | `/api/staff/customers`               | Search and page through account holders                |
| `GET`  | `/api/staff/customers/:id`           | One account holder's profile                           |

The Artifact's route table mounts the account-holder reads under `staff/` alongside the
passenger ones. They are separate routes rather than a client-side filter, so the contract
lives in the API instead of only in the browser.

**Guard label.** The Artifact marks these `S` (staff). There is no role guard in
this codebase — `AuthenticatedUser` is `{ id, email }` and `apps/backend/CLAUDE.md`
says to ask before adding one — so today any authenticated caller, including a
customer token, reaches these routes. That is an open gap, not a design choice;
see _Blockers_ below.

### `POST /api/staff/passengers`

Body: `firstName` and `lastName` are required; `localFirstName`, `localLastName`,
`dateOfBirth`, `gender`, `nationality` and `passportNumber` are optional and recorded
as `null` when absent. Those two are the only `NOT NULL` columns on `passenger`, so
the required set follows the table rather than a house rule. Answers `201` with the
usual `PassengerSummary`, so the caller can render the row without a second request.

Input is normalised the same way the correction route normalises it: gender to
`M`/`F`/`X`, nationality to a lower-case two-letter code, passport to upper case
without spaces or dashes, date of birth to midnight UTC. The normalisation lives in the
`@Transform` readers on `IdentityFieldsDto` in `dto/identity-fields.ts`, which both body
DTOs extend, because both routes write columns the database constrains with a `CHECK`,
and two copies of those rules would eventually disagree.

**This creates a passenger row and nothing else.** A `customer` requires a unique
`user_id` and a `passenger_id`, and an account that does not originate from a Clerk
sign-in could never authenticate — `AuthService` owns that path. So a passenger
created here has no `customer` row, which is exactly what `toSummary` reads to label
it `traveller`, and it therefore appears under the `traveller` filter in
`GET /api/staff/passengers` with a null email, phone and member-since. No frontend change
is needed for it to show up.

### `GET /api/staff/passengers`

Query: `q`, `type` (`all` \| `accountHolder` \| `traveller`), `page` (1-based),
`size` (1–100, default 20). Responds `{ items, total, page, size }`.

`q` is split on whitespace, and **every** term has to match something, so a full
name works: `Anabel Effertz` finds the row whose first name is one term and last
name the other. Each term matches case-insensitively as a substring of either name
spelling or the passport number, the account holder's email (only when the
account is not soft-deleted), or the date of birth.

A substring test includes every prefix match, so `A` surfaces `Anabel Effertz`
and `An` narrows further, while `ertz` still finds `Effertz` from the middle of a
surname.

The date of birth is the one field that is not a text column — `passenger.date_of_birth`
is a `@db.Date`, so it cannot take `contains`. A `YYYY`, `YYYY-MM` or `YYYY-MM-DD`
term (the shape the staff UI displays) becomes the half-open range of days it could
cover, which also keeps the lookup on `passenger_dob_idx` instead of forcing a cast
per row. A term that is not a real date, including a rolled-over one like
`2023-02-30`, is not turned into a range. The passenger id is compared only when
the term is a UUID, since the column is a `@db.Uuid`.

Matching every term means a query cannot widen the result set: `Anabel` matches one
column group, and adding `Effertz` intersects with a second.

### `GET /api/staff/customers` and `GET /api/staff/customers/:id`

The account-holder side. Both reuse `toSummary`, so **passports are masked here exactly as
they are on the passenger routes**, and both are audited the same way.

`GET /api/staff/customers` takes `q`, `page` and `size`, with `q` matched by the identical
rules described above — same tokenizer, same "every term must match", same date ranges. The
only difference is that the split is **fixed**: the query carries no `type` at all. There is
nothing for a caller to select and therefore nothing to send, which is why `SearchCustomersDto`
declares no `type` — a client that sends one has it dropped by `whitelist` rather than obeyed.
A type-aware DTO here would advertise a parameter the route ignores and silently return
account holders for `type=traveller`.

`GET /api/staff/customers/:id` takes the **passenger id** of the holder, the same id the
passenger routes use, rather than a `customer.id`. An account holder _is_ a passenger row that
also owns a `customer`, so reusing that id is what lets the client key a person by one id no
matter which route loaded the row. A traveller id is a `404` here: the route is the account
side, and answering it for a traveller would make the two routes indistinguishable.

That `404` is raised **before** the `view_sensitive` audit is written, so a rejected read
leaves no audit row — the same rule the not-found path on the passenger route follows.

### `GET /api/staff/passengers/:id`

Responds a `PassengerProfile`: the summary fields plus `savedTravellers` for an
account holder, or `linkedAccounts` for a traveller. Both come from the same
`customer_passenger` rows, but from **opposite ends** of the table — it is
"who a customer books for" (`schema.sql`), so:

| Passenger      | Relation read                  | Answers                             |
| -------------- | ------------------------------ | ----------------------------------- |
| Account holder | `customer.customer_passenger`  | people this account has saved       |
| Traveller      | `passenger.customer_passenger` | accounts this passenger is saved on |

Both relations are selected in the one query rather than in a second round
trip; only the one that applies is used. Reading the passenger-level relation
for a holder is the bug this section exists to prevent: it lists the accounts
that saved _this_ passenger, so it is empty for every holder who is not
themselves saved on their own account, and the Customer Search detail screen
loses its Saved Travellers card.

An account holder is filtered out of their own `savedTravellers`, since a
holder is not one of their own travellers. A soft-deleted passenger or account
gives `404`; a link whose account is soft-deleted is dropped from
`linkedAccounts`.

**Passport numbers are masked by the API.** The Artifact requires the passport
to be masked "for non-security staff", so masking happens in `toSummary` rather
than in the browser: every response carries `•••• 1234`, never the full number.
Matching is unaffected — a passport search term is compared in SQL against the
stored column, so staff can still find a passenger by typing the real number.

There is no security role to except: `staff.role_id` points at roles seeded as
check-in/gate/baggage/admin, so the mask currently applies to every caller. The
Artifact's security-staff exception is therefore **unimplemented** and is
recorded under _Blockers_ rather than approximated.

**Opening a profile is audited.** The Artifact requires that "opening passenger
or customer detail is audited as `view_sensitive`", so this route writes an
`audit_log` row with `action = 'view_sensitive'` and `is_sensitive = true`. It is
written after the read and outside the read's transaction, so a `404` writes
nothing and a failed audit write does not turn a successful view into a `500`.

### `PUT /api/staff/passengers/:id/identity`

The "Correct identity" dialog. `schema.sql` notes that date of birth, gender and
nationality are set once and only a staff correction may change them, so **the
body carries only those three columns**, plus `reason` and `confirm: true`.
Names, local spellings and the passport number are not correctable through this
route and are not declared on the DTO: because the controller pipe runs with
`whitelist`, a client still sending the old full-record body has them dropped
rather than written. The update therefore touches only the three columns.

Input is normalised to the stored formats: gender to `M`/`F`/`X`, nationality to
a lower-case two-letter code, date of birth to midnight UTC and range-checked
(not before 1900, not in the future — see _Blockers_ for the simulation clock).

The update and the `audit_log` row are written in one `$transaction`, so a
passenger row can never change without its audit trail. Audit rows carry
`source_feature = 'passenger-profiles'`, `action = 'update'` and
`is_sensitive = true`. Both snapshots mask the passport, and `after` covers only
the three corrected columns.

**DOB is masked on a view but not on a correction.** The Artifact says "passport
and DOB are masked in audit entries", and the `view_sensitive` row does mask the
DOB — it records only that a profile was opened, so the exact birthday buys the
trail nothing. A correction is different: masking its `before`/`after` pair
would leave it reading `••••-••-03 → ••••-••-08` and stop recording what was
corrected, which is the one thing the row is for. The correction therefore keeps
the real date and **this departure from the Artifact is unresolved** — see
_Blockers_.

**On the audit `action` value.** The earlier code wrote
`passenger.identity_corrected`, which is not in the `audit_log.action` CHECK
enum, so the `INSERT` failed and — because the audit row shares the transaction
with the update — the whole correction rolled back with a `500`. The Artifact
says a correction is "logged in feature 15" but never names an action, so this
module uses `update`, the existing enum value that describes it. Widening the
shared enum is Feature 15's call, not this module's; see _Blockers_.

## Validation

All six routes are validated by a `ValidationPipe` applied with `@UsePipes` on
`PassengerProfilesController` and `CustomerProfilesController` — **not** by a global pipe,
because `main.ts` has none and shared configuration is not this module's to change. A
controller without its own `@UsePipes` is silently unvalidated, so any route added here needs
one too.

The pipe runs with `transform: true, whitelist: true`:

- **`transform`** — `class-validator` only checks a value, so normalisation lives in the
  `@Transform` readers on the DTOs. `'f'` is stored as `F`, `'TH'` as `th`, a passport is
  upper-cased and stripped of spaces and dashes, and a date of birth becomes midnight UTC.
  The service therefore receives already-normalised values.
- **`whitelist`** — properties a DTO does not declare are **dropped, not rejected**. A
  body carrying `actor_id` or `role` still returns `201`, and those fields never reach the
  database. This is why the correction route takes the actor from the bearer token, and
  why a name or passport sent to `.../identity` is discarded rather than written.
- A `400` body is Nest's standard shape, with `message` as an **array** of strings. The
  staff-web client reads `message[0]`.

`ParseUUIDPipe` guards the `:id` path parameter separately, so a non-UUID id is a `400`
rather than a Postgres cast failure.

## Deliberate deviations

- **Page pagination, not cursor.** `apps/backend/CLAUDE.md` prefers cursors for
  large lists. The staff-web results pager addresses pages by number, so a cursor
  would break the only client. Revisit together if that pager changes.
- **Nationality membership is not checked.** Only the `^[a-z]{2}$` format is
  enforced. No country-code list ships in this repository, and rejecting a valid
  code would be worse than accepting an unknown one. This needs the team's list.
- **The DOB upper bound uses the wall clock.** The Artifact says a date of birth
  must not be after "the simulation date", but no simulation clock exists anywhere
  in this repository — `schema.sql` marks the columns that are meant to read from
  one, but there is nothing to read. `readDateOfBirth` therefore rejects a future
  date against `Date.now()`. Swap it when a simulation clock lands.

## Blockers — needs another team

- **The security-staff exception on passport masking is unimplemented.** The
  Artifact masks the passport "for non-security staff", which implies security
  staff see it in the clear. The role model cannot express that: `staff.role_id`
  references `role`, seeded as check-in/gate/baggage/admin, with no security role,
  and no code anywhere reads that role for authorization. Masking is therefore
  applied to every caller. Resolving it needs a security role and a role guard —
  both shared, cross-cutting changes this module must not make on its own.
- **Widening `audit_log.action` is Feature 15's call.** A correction is logged as
  `update`. If Feature 15 wants a dedicated action, that is a migration on the
  shared enum.
- **Whether a correction's audit row may hold the real DOB is Feature 15's call.**
  The Artifact says passport and DOB are masked in audit entries. That is
  implemented for `view_sensitive`, but not for the correction's `before`/`after`
  pair, where masking would make the row unable to record the change it exists to
  record. `audit_log` is Feature 15's table and the Artifact never specifies a
  correction's columns, so the choice is theirs: mask it and accept an
  unreadable trail, or keep the real date and accept this documented deviation.
- **Re-screening after a correction is not implemented.** The Artifact says a
  correction "re-screens the passenger's upcoming flights" and that features 3b
  and 6 call `POST /screening/check`. Feature 7 owns the watchlist and matching
  rules but the screening service itself is not built, so there is no documented
  contract to call. This module writes the correction and its audit row; the
  re-screen is a reported dependency, not a silent omission.
- **The `S` staff guard is not enforced.** See the note under _Routes_.

## Not in this module

- **Creating an account.** `POST /api/staff/passengers` deliberately stops at the passenger
  row; see the route notes above. The Artifact's `POST /staff/passengers` also links the
  new passenger to a customer when staff book on someone's behalf — that linking is **not**
  implemented here, because it belongs to the booking flow (feature 3b) and needs the
  customer id it does not currently accept.
- **Auditing creates.** The correction writes an `audit_log` row because it has a
  `before` state and a `reason` to justify it. A create has neither, so it writes
  none — worth confirming with the Admin Console team (Feature 15), which owns that
  surface, before it is relied on.
- **Reading audit rows** — the Admin Console team (Feature 15) owns that surface.
