# F7 — Customer and passenger profiles / screening

> **Status: COMMITTED SCHEMA — inventory checked 27 Oct 2026 against `dev` commit `46a7f55be46a2237545869cbec356cd61e5a31d6`.** The SQL and Prisma table/column inventories match: **84 tables / 772 columns**, including F2 approvals, F8 crew/rostering and F7 screening Iteration-03. Committed migrations do not prove deployment or completed application behavior.

**Tables (6):** [`passenger`](#table-passenger) · [`customer`](#table-customer) · [`customer_passenger`](#table-customer_passenger) · [`watchlist_entry`](#table-watchlist_entry) · [`screening_check`](#table-screening_check) · [`screening_review`](#table-screening_review)

**Later migration:** `20261025120000_feature7_screening_iteration_03/migration.sql` brings `screening_check` and `screening_review` up to the F7 Iteration-03 doc (identity snapshot, correctable reviews) and adds `watchlist_entry.gender`. With it the schema has 84 tables / 772 columns.

<a id="table-passenger"></a>

### `passenger`

Travel identity for a person, whether or not that person has a customer account.

**Important behavior:** May have no account; rows need not be unique by identity, since different customers may book the same traveller. Passport normalization/identity change limits are backend rules.

| Column             | SQL type      | Constraints / linkage                     | Meaning                                                    |
| ------------------ | ------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `id`               | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                         |
| `first_name`       | `TEXT`        | required                                  | Passport (Latin) spelling.                                 |
| `last_name`        | `TEXT`        | required                                  | Family or last name.                                       |
| `local_first_name` | `TEXT`        | nullable                                  | E.g. Thai spelling, for autocomplete.                      |
| `local_last_name`  | `TEXT`        | nullable                                  | Family name in the passenger’s local writing system.       |
| `date_of_birth`    | `DATE`        | nullable                                  | Date of birth recorded for passenger identity checks.      |
| `gender`           | `TEXT`        | nullable; Allowed: M, F, X                | Passport gender marker: M, F, or X.                        |
| `nationality`      | `TEXT`        | nullable                                  | Short country code, validated by the backend.              |
| `passport_number`  | `TEXT`        | nullable                                  | Passport identifier used for traveller/watchlist matching. |
| `created_at`       | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp.                        |
| `updated_at`       | `TIMESTAMPTZ` | required; default `now()`                 | Last modification timestamp (application-maintained).      |
| `deleted_at`       | `TIMESTAMPTZ` | nullable                                  | Soft-delete timestamp; NULL means not deleted.             |

**Indexes:** `passenger_passport_idx` (index; `(passport_number) WHERE passport_number IS NOT NULL`); `passenger_dob_idx` (index; `(date_of_birth) WHERE date_of_birth IS NOT NULL`).

<a id="table-customer"></a>

### `customer`

Customer account profile linked to the owner’s passenger identity.

**Important behavior:** `passenger_id` identifies the account holder, not a saved traveller. One customer record per user and per owner-passenger.

| Column              | SQL type      | Constraints / linkage                                                    | Meaning                                               |
| ------------------- | ------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| `id`                | `UUID`        | PK; required; default `gen_random_uuid()`                                | Unique identifier for this record.                    |
| `user_id`           | `UUID`        | FK → `user(id, type) (composite)`; required                              | Related shared login user identifier.                 |
| `user_type`         | `TEXT`        | FK → `user(id, type) (composite)`; required; default `'customer'`; CHECK | Fixed to customer to enforce correct identity type.   |
| `passenger_id`      | `UUID`        | FK → `passenger(id)`; required; unique                                   | The customer account holder’s own traveller identity. |
| `phone`             | `TEXT`        | nullable                                                                 | Contact telephone number.                             |
| `profile_photo_url` | `TEXT`        | nullable                                                                 | Location or URL of the customer’s profile picture.    |
| `created_at`        | `TIMESTAMPTZ` | required; default `now()`                                                | Actual database creation timestamp.                   |
| `updated_at`        | `TIMESTAMPTZ` | required; default `now()`                                                | Last modification timestamp (application-maintained). |
| `deleted_at`        | `TIMESTAMPTZ` | nullable                                                                 | Soft-delete timestamp; NULL means not deleted.        |

**Table-level SQL constraints:** `FOREIGN KEY (user_id, user_type) REFERENCES "user" (id, type)` · `UNIQUE (user_id)`

<a id="table-customer_passenger"></a>

### `customer_passenger`

People a customer books for, including saved-traveller links and relationship.

**Important behavior:** Saved companions use `is_saved`; removing a saved traveller retains the link for historical bookings.

| Column              | SQL type      | Constraints / linkage                                                         | Meaning                                                                     |
| ------------------- | ------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `id`                | `UUID`        | PK; required; default `gen_random_uuid()`                                     | Unique identifier for this record.                                          |
| `customer_id`       | `UUID`        | FK → `customer(id)`; required                                                 | Related customer account identifier.                                        |
| `passenger_id`      | `UUID`        | FK → `passenger(id)`; required                                                | Related traveller identity identifier.                                      |
| `relationship_type` | `TEXT`        | nullable; Allowed: spouse, parent, child, sibling, guardian, companion, other | How traveller relates to account holder (parent means traveller is parent). |
| `is_saved`          | `BOOLEAN`     | required; default `true`                                                      | Whether this traveller appears in the saved list.                           |
| `last_booked_at`    | `TIMESTAMPTZ` | nullable                                                                      | Latest simulated booking time.                                              |
| `created_at`        | `TIMESTAMPTZ` | required; default `now()`                                                     | Actual database creation timestamp.                                         |
| `updated_at`        | `TIMESTAMPTZ` | required; default `now()`                                                     | Last modification timestamp (application-maintained).                       |

**Table-level SQL constraints:** `UNIQUE (customer_id, passenger_id)`

**Indexes:** `customer_passenger_recent_idx` (index; `(customer_id, last_booked_at DESC NULLS LAST) WHERE is_saved`); `customer_passenger_passenger_idx` (index; `(passenger_id)`).

<a id="table-watchlist_entry"></a>

### `watchlist_entry`

Travel watchlist identity, status, and issuing/clearing details.

**Important behavior:** Name matching uses a normalized expression and pg_trgm to support fuzzy comparisons. Clearing metadata is managed by backend.

| Column                | SQL type      | Constraints / linkage                                  | Meaning                                                    |
| --------------------- | ------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| `id`                  | `UUID`        | PK; required; default `gen_random_uuid()`              | Unique identifier for this record.                         |
| `first_name`          | `TEXT`        | required                                               | First name.                                                |
| `last_name`           | `TEXT`        | required                                               | Family or last name.                                       |
| `date_of_birth`       | `DATE`        | nullable                                               | Date of birth recorded for passenger identity checks.      |
| `gender`              | `TEXT`        | nullable; Allowed: M, F, X                             | Shown on the review screen; matching does not use it.      |
| `nationality`         | `TEXT`        | nullable                                               | Normalised like passenger.                                 |
| `passport_number`     | `TEXT`        | nullable                                               | Passport identifier used for traveller/watchlist matching. |
| `list_type`           | `TEXT`        | required; Allowed: wanted, travel_ban, no_fly          | Wanted, travel ban, or no-fly watchlist category.          |
| `status`              | `TEXT`        | required; default `'active'`; Allowed: active, cleared | Current lifecycle status.                                  |
| `issuing_authority`   | `TEXT`        | required                                               | Organization that added the person to the watchlist.       |
| `reason`              | `TEXT`        | nullable                                               | Human-readable cause or explanation.                       |
| `listed_at`           | `TIMESTAMPTZ` | required                                               | Simulation clock.                                          |
| `cleared_at`          | `TIMESTAMPTZ` | nullable                                               | Simulated time of clearing.                                |
| `cleared_by_staff_id` | `UUID`        | FK → `staff(id)`; nullable                             | Staff reviewer who cleared the entry.                      |
| `clear_reason`        | `TEXT`        | nullable                                               | Why an entry was cleared.                                  |
| `created_by_staff_id` | `UUID`        | FK → `staff(id)`; required                             | Staff member who created the record.                       |
| `created_at`          | `TIMESTAMPTZ` | required; default `now()`                              | Actual database creation timestamp.                        |
| `updated_at`          | `TIMESTAMPTZ` | required; default `now()`                              | Last modification timestamp (application-maintained).      |

**Table-level SQL constraints:** `CHECK ((status = 'cleared') = (cleared_at IS NOT NULL))`

**Indexes:** `watchlist_entry_passport_idx` (index; `(passport_number) WHERE status = 'active' AND passport_number IS NOT NULL`); `watchlist_entry_name_dob_idx` (index; `(name_key(first_name, last_name), date_of_birth) WHERE status = 'active'`); `watchlist_entry_name_trgm` (index; `USING gin (name_key(first_name, last_name) gin_trgm_ops) WHERE status = 'active'`).

<a id="table-screening_check"></a>

### `screening_check`

One screening comparison: a passenger against one watchlist entry, or a clean run, with both identities as compared.

**Important behavior:** Rows are never updated or deleted (backend rule). A clean run is one row with match level `none`; each matched entry is its own row. The `snap_` columns keep the passenger and the watchlist entry as compared, so the review screen shows what matched even after either record is edited; they are written in the same insert as the row. The departure time is not copied: the Screening Queue joins `flight`, so delays show. A retry cannot duplicate a hit at booking, check-in or new entry; `entry_change` and `identity_change` can repeat.

| Column                     | SQL type      | Constraints / linkage                                                          | Meaning                                                                           |
| -------------------------- | ------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `id`                       | `UUID`        | PK; required; default `gen_random_uuid()`                                      | Unique identifier for this record.                                                |
| `run_id`                   | `UUID`        | required                                                                       | Identifier of a single screening invocation or background job pass.               |
| `passenger_id`             | `UUID`        | FK → `passenger(id)`; required                                                 | Related traveller identity identifier.                                            |
| `flight_id`                | `UUID`        | cross-FK → `flight(id)`; required                                              | Related dated flight identifier; the queue sorts by its departure time.           |
| `pnr_id`                   | `UUID`        | nullable                                                                       | Optional booking locator ID (F3b, no FK).                                         |
| `trigger_point`            | `TEXT`        | required; Allowed: booking, check_in, new_entry, entry_change, identity_change | Event that triggered the check; `entry_change` is an edited or reactivated entry. |
| `watchlist_entry_id`       | `UUID`        | FK → `watchlist_entry(id)`; nullable                                           | Identifier of the related watchlist entry.                                        |
| `match_level`              | `TEXT`        | required; Allowed: none, weak, probable, strong                                | Matching strength: none, weak, probable, or strong.                               |
| `name_similarity`          | `REAL`        | 0 to 1; set exactly when `watchlist_entry_id` is set                           | Trigram similarity of the name keys, the better of both name orders.              |
| `outcome`                  | `TEXT`        | required; Allowed: clear, flagged, held                                        | Initial screening outcome: clear, flagged, held.                                  |
| `snap_first_name`          | `TEXT`        | required                                                                       | Passenger first name as compared (passport spelling).                             |
| `snap_last_name`           | `TEXT`        | required                                                                       | Passenger last name as compared (passport spelling).                              |
| `snap_date_of_birth`       | `DATE`        | nullable                                                                       | Passenger date of birth as compared.                                              |
| `snap_gender`              | `TEXT`        | nullable; Allowed: M, F, X                                                     | Passenger gender as compared.                                                     |
| `snap_nationality`         | `TEXT`        | nullable                                                                       | Passenger nationality as compared.                                                |
| `snap_passport`            | `TEXT`        | nullable                                                                       | Passenger passport number as compared.                                            |
| `snap_entry_first_name`    | `TEXT`        | set exactly when `watchlist_entry_id` is set                                   | Watchlist entry first name as compared.                                           |
| `snap_entry_last_name`     | `TEXT`        | set exactly when `watchlist_entry_id` is set                                   | Watchlist entry last name as compared.                                            |
| `snap_entry_date_of_birth` | `DATE`        | nullable; NULL without an entry                                                | Watchlist entry date of birth as compared, if the entry has one.                  |
| `snap_entry_gender`        | `TEXT`        | nullable; Allowed: M, F, X; NULL without an entry                              | Watchlist entry gender as compared, if the entry has one.                         |
| `snap_entry_nationality`   | `TEXT`        | nullable; NULL without an entry                                                | Watchlist entry nationality as compared, if the entry has one.                    |
| `snap_entry_passport`      | `TEXT`        | nullable; NULL without an entry                                                | Watchlist entry passport number as compared, if the entry has one.                |
| `occurred_at`              | `TIMESTAMPTZ` | required                                                                       | Simulation clock.                                                                 |
| `created_at`               | `TIMESTAMPTZ` | required; default `now()`                                                      | Actual database creation timestamp.                                               |

**Table-level SQL constraints:** `CHECK (CASE WHEN watchlist_entry_id IS NULL THEN num_nonnulls(name_similarity, snap_entry_first_name, snap_entry_last_name, snap_entry_date_of_birth, snap_entry_gender, snap_entry_nationality, snap_entry_passport) = 0 ELSE num_nonnulls(name_similarity, snap_entry_first_name, snap_entry_last_name) = 3 END)`

**Indexes:** `screening_check_once_uq` (unique; `(passenger_id, flight_id, watchlist_entry_id, trigger_point) WHERE watchlist_entry_id IS NOT NULL AND trigger_point IN ('booking', 'check_in', 'new_entry')`); `screening_check_flight_idx` (index; `(flight_id)`); `screening_check_passenger_idx` (index; `(passenger_id, occurred_at DESC)`); `screening_check_open_idx` (index; `(flight_id) WHERE outcome IN ('flagged', 'held')`).

**Cross-feature linkage:** `flight_id` → `flight(id)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-screening_review"></a>

### `screening_review`

Staff decision on a flagged or held screening check, with corrections kept as history.

**Important behavior:** Rows are never updated or deleted (backend rule). A correction is a new row with the next `revision`, and the highest revision for a check is the decision; earlier rows stay as history. The backend inserts the corrected review's revision + 1, so of two corrections made at the same time the second fails on `(screening_check_id, revision)`; map that to a conflict ("decision changed, please reload"). Rules that use a prior decision (skip a `false_positive`, deny a `confirmed`) read each check's latest review. The Screening Queue lists flagged or held checks with no review.

| Column                  | SQL type      | Constraints / linkage                             | Meaning                                              |
| ----------------------- | ------------- | ------------------------------------------------- | ---------------------------------------------------- |
| `id`                    | `UUID`        | PK; required; default `gen_random_uuid()`         | Unique identifier for this record.                   |
| `screening_check_id`    | `UUID`        | FK → `screening_check(id)`; required              | Identifier of the related screening check.           |
| `revision`              | `INTEGER`     | required; >= 1; no default; unique with the check | 1 for the first review, +1 for each correction.      |
| `decision`              | `TEXT`        | required; Allowed: confirmed, false_positive      | Staff decision for a screening match.                |
| `reviewed_by_staff_id`  | `UUID`        | FK → `staff(id)`; required                        | Identifier of the related reviewed by staff.         |
| `review_note`           | `TEXT`        | required                                          | Required explanation for the staff screening review. |
| `reviewed_at`           | `TIMESTAMPTZ` | required                                          | Simulation clock.                                    |
| `authority_notified_at` | `TIMESTAMPTZ` | nullable                                          | Simulation clock; feature 13 is mocked.              |
| `created_at`            | `TIMESTAMPTZ` | required; default `now()`                         | Actual database creation timestamp.                  |

**Table-level SQL constraints:** `UNIQUE (screening_check_id, revision)`

---

[← Database documentation home](../docs.md) · [Seed data](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
