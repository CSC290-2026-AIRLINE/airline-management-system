# F7 — Customer and passenger profiles / screening

> **Status: MERGED LEVEL 1 SCHEMA — verified against `dev` on 21 Oct 2026 (`752428e732da`).** [PR #14](https://github.com/CSC290-2026-AIRLINE/airline-management-system/pull/14) merged on 12 Oct 2026 (16:54 UTC). The F1/F2/F4/F7/F9/F12/F15 SQL dictionary describes the committed 69-table Level 1 schema; Feature 8 is documented separately as an **unmerged proposal**. Repository merge is not proof of deployment to any running database or final feature-owner approval.

**Tables (6):** [`passenger`](#table-passenger) · [`customer`](#table-customer) · [`customer_passenger`](#table-customer_passenger) · [`watchlist_entry`](#table-watchlist_entry) · [`screening_check`](#table-screening_check) · [`screening_review`](#table-screening_review)

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

Snapshot of an automated screening run and a possible watchlist match.

**Important behavior:** Rows are intended to be immutable in backend logic. One clean run uses match level `none`; matching entries use separate rows. Certain repeated checks are prevented by a partial unique index.

| Column               | SQL type      | Constraints / linkage                                            | Meaning                                                                     |
| -------------------- | ------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `id`                 | `UUID`        | PK; required; default `gen_random_uuid()`                        | Unique identifier for this record.                                          |
| `run_id`             | `UUID`        | required                                                         | Identifier of a single screening invocation.                                |
| `passenger_id`       | `UUID`        | FK → `passenger(id)`; required                                   | Related traveller identity identifier.                                      |
| `flight_id`          | `UUID`        | cross-FK → `flight(id)`; required                                | Related dated flight identifier.                                            |
| `flight_dep_at`      | `TIMESTAMPTZ` | required                                                         | Copied flight departure time used to sort the review queue.                 |
| `pnr_id`             | `UUID`        | nullable                                                         | Optional booking locator ID (F3b, no FK).                                   |
| `trigger_point`      | `TEXT`        | required; Allowed: booking, check_in, new_entry, identity_change | Event that triggered the check: booking/check-in/new entry/identity change. |
| `watchlist_entry_id` | `UUID`        | FK → `watchlist_entry(id)`; nullable                             | Identifier of the related watchlist entry.                                  |
| `match_level`        | `TEXT`        | required; Allowed: none, weak, probable, strong                  | Matching strength: none, weak, probable, or strong.                         |
| `outcome`            | `TEXT`        | required; Allowed: clear, flagged, held                          | Initial screening outcome: clear, flagged, held.                            |
| `occurred_at`        | `TIMESTAMPTZ` | required                                                         | Simulation clock.                                                           |
| `created_at`         | `TIMESTAMPTZ` | required; default `now()`                                        | Actual database creation timestamp.                                         |

**Indexes:** `screening_check_once_uq` (unique; `(passenger_id, flight_id, watchlist_entry_id, trigger_point) WHERE watchlist_entry_id IS NOT NU…`); `screening_check_flight_idx` (index; `(flight_id)`); `screening_check_passenger_idx` (index; `(passenger_id, occurred_at DESC)`); `screening_check_queue_idx` (index; `(flight_dep_at) WHERE outcome IN ('flagged', 'held')`).

**Cross-feature linkage:** `flight_id` → `flight(id)`. Declared in Part 8; coordinate any decision to omit with Database Leads.

<a id="table-screening_review"></a>

### `screening_review`

Staff decision on a flagged or held screening check.

**Important behavior:** Review decisions are written to a new row; a mistaken decision requires a new screening check, not an edit.

| Column                  | SQL type      | Constraints / linkage                        | Meaning                                              |
| ----------------------- | ------------- | -------------------------------------------- | ---------------------------------------------------- |
| `id`                    | `UUID`        | PK; required; default `gen_random_uuid()`    | Unique identifier for this record.                   |
| `screening_check_id`    | `UUID`        | FK → `screening_check(id)`; required; unique | Identifier of the related screening check.           |
| `decision`              | `TEXT`        | required; Allowed: confirmed, false_positive | Final staff decision for a screening match.          |
| `reviewed_by_staff_id`  | `UUID`        | FK → `staff(id)`; required                   | Identifier of the related reviewed by staff.         |
| `review_note`           | `TEXT`        | required                                     | Required explanation for the staff screening review. |
| `reviewed_at`           | `TIMESTAMPTZ` | required                                     | Simulation clock.                                    |
| `authority_notified_at` | `TIMESTAMPTZ` | nullable                                     | Simulation clock; feature 13 is mocked.              |
| `created_at`            | `TIMESTAMPTZ` | required; default `now()`                    | Actual database creation timestamp.                  |

---

[← Database documentation home](../docs.md) · [Seed data](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
