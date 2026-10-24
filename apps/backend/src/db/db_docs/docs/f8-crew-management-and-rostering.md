# F8 — Crew Management & Rostering

> **Status: COMMITTED SCHEMA — verified 24 Oct 2026 against `dev` commit `a97740c646b2a6e82448243db4817a7a5822e14b`.** The current SQL and Prisma schema contain **84 tables / 758 columns**, including F2 Iteration-03 and F8 crew/rostering. Committed migrations do not prove deployment or completed application behavior.

**Feature owner:** Group 1 — Choto and Xiang Xiang.  
**Tables (11):** `crew_setting`, `country_legality_rule`, `country_language`, `crew`, `crew_certification`, `pairing`, `pairing_leg`, `roster_run`, `roster_run_pairing`, `pairing_leg_assignment`, `rule_break`.

**Migration:** `20261024120000_feature8_crew_rostering/migration.sql`.

## Scope and enforcement boundary

These tables are committed database structures. The migration's introductory word “proposed” is historical source wording; the CREATE TABLE statements and Prisma models are present in the inspected commit. This does not establish that the migration has run in any environment. No F8 application module, assignment worker, simulation-clock job or publication service exists in this checkout.

Crew are operational records; `staff_id` optionally links shared staff identity and does not introduce crew login. `fleet_aircraft_type` and certification `aircraft_type` refer to **aircraft_type.model**, not layout-specific code or a UUID FK. The backend must validate the active model. Base-airport FKs correctly target `airport.iata_code`; `airport.country` now has a lowercase two-letter format CHECK. Country/language codes have no canonical-country FK.

## Shared feature dependencies

F8 owns crew and roster data. It reuses other features' records and integrates with their services rather than duplicating their tables. Some dependencies are SQL foreign keys; others are application contracts that have not been implemented yet.

| Direction          | Feature            | Shared data / responsibility                                      | Current evidence                                                                                       |
| ------------------ | ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Supports F8        | F1 identity        | Staff acting in Ops and approving overrides                       | SQL FKs to staff; no separate crew login                                                               |
| Supports F8        | F2 scheduling      | Dated flights, routes, airports, country codes and flight changes | Airport/flight FKs exist; event-driven roster rechecks remain application work                         |
| Supports F8        | F9 aircraft        | Assigned aircraft type, model and seat layout                     | F2 flight points to aircraft; F8 fleet/rating TEXT matches aircraft_type.model; no separate type table |
| Supports F8        | F15 audit          | Shared action history and actor contract                          | Audit table exists; F8 audit writer remains application work                                           |
| Shared integration | F3 / F6            | Police passenger seats and boarding                               | Booking/boarding contract remains to be implemented outside F8's crew tables                           |
| F8 supplies        | F5 finance/payroll | Derived duty-hour totals for overtime                             | Output contract remains to be implemented; payment logic belongs to F5                                 |
| F8 supplies        | F13 notifications  | Published-roster and assignment-change notifications              | Notification contract and delivery remain to be implemented                                            |

Cross-feature dependencies do not by themselves mean the F8 schema is incomplete. For example, aircraft types already belong to F9, and F8 uses that existing data. The dictionary below describes the current schema; replacing model strings with UUID references would be a separate coordinated schema decision.

## Settings inserted by SQL and the F8 migration

All values are TEXT. These are project defaults, not independently verified aviation requirements.

| Key                        | Inserted value | Interpretation                                |
| -------------------------- | -------------- | --------------------------------------------- |
| `min_rest_hours`           | `10`           | Default minimum rest                          |
| `max_duty_hours`           | `13`           | Default maximum duty                          |
| `max_flights_per_duty`     | `4`            | Maximum legs per duty                         |
| `max_pairing_days`         | `3`            | Maximum pairing duration                      |
| `max_flight_hours_28d`     | `100`          | Rolling 28-day flight-hour limit              |
| `min_local_crew`           | `1`            | Destination-language crew minimum             |
| `min_police_international` | `2`            | Police minimum on international legs          |
| `seats_per_cabin_crew`     | `50`           | Cabin count = ceil(layout seats / this value) |
| `report_minutes`           | `60`           | Duty starts before first departure            |
| `release_minutes`          | `0`            | Duty ends after last arrival                  |
| `expiry_warning_days`      | `30`           | Licence/certification warning interval        |

`country_legality_rule` holds positive country-specific rest/duty values. Applying the stricter limit (more rest, less duty), including after a default changes, is an application requirement. The earlier nullable `legality_rule` design was replaced; there is no nullable default-country row.

## Data dictionary

<a id="table-crew_setting"></a>

### `crew_setting`

F8 default limits and operational settings, stored as text. Values require application validation.

| Column       | SQL type      | Constraints / linkage                                                                                                                                                                                                                                                              | Meaning                                                        |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `key`        | `TEXT`        | required; `PRIMARY KEY CHECK (key IN ( 'min_rest_hours', 'max_duty_hours', 'max_flights_per_duty', 'max_pairing_days', 'max_flight_hours_28d', 'min_local_crew', 'min_police_international', 'seats_per_cabin_crew', 'report_minutes', 'release_minutes', 'expiry_warning_days'))` | Allowed configuration key; see settings below.                 |
| `value`      | `TEXT`        | required; `NOT NULL`                                                                                                                                                                                                                                                               | Text setting value; application validates its interpretation.  |
| `updated_at` | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                                                                                                                                                                                                                                                 | Real last-update time; application-maintained after insertion. |
| `updated_by` | `UUID`        | nullable; `REFERENCES staff (id)`                                                                                                                                                                                                                                                  | Optional staff member who last changed this setting.           |

<a id="table-country_legality_rule"></a>

### `country_legality_rule`

Stricter country-specific rest and duty thresholds; default limits live in crew_setting.

| Column           | SQL type       | Constraints / linkage                                       | Meaning                                                          |
| ---------------- | -------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `country_code`   | `TEXT`         | required; `PRIMARY KEY CHECK (country_code ~ '^[a-z]{2}$')` | Lowercase two-letter country code; no FK to a country catalogue. |
| `min_rest_hours` | `NUMERIC(4,1)` | required; `NOT NULL CHECK (min_rest_hours > 0)`             | Minimum rest hours for this country; positive.                   |
| `max_duty_hours` | `NUMERIC(4,1)` | required; `NOT NULL CHECK (max_duty_hours > 0)`             | Maximum duty hours for this country; positive.                   |
| `updated_at`     | `TIMESTAMPTZ`  | required; `NOT NULL DEFAULT now()`                          | Real last-update time; application-maintained after insertion.   |
| `updated_by`     | `UUID`         | nullable; `REFERENCES staff (id)`                           | Optional staff member who last changed this setting.             |

<a id="table-country_language"></a>

### `country_language`

Country-to-local-language mapping. The composite primary key permits multiple languages per country.

| Column          | SQL type | Constraints / linkage                                     | Meaning                                                          |
| --------------- | -------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| `country_code`  | `TEXT`   | required; `NOT NULL CHECK (country_code ~ '^[a-z]{2}$')`  | Lowercase two-letter country code; no FK to a country catalogue. |
| `language_code` | `TEXT`   | required; `NOT NULL CHECK (language_code ~ '^[a-z]{2}$')` | Lowercase two-letter language code.                              |

**Table-level SQL constraints:**

- `PRIMARY KEY (country_code, language_code)`

<a id="table-crew"></a>

### `crew`

Operational crew, optionally linked to shared staff sign-in. Crew are soft-deleted.

| Column                | SQL type      | Constraints / linkage                                                                                        | Meaning                                                                                                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `id`                  | `UUID`        | required; `PRIMARY KEY DEFAULT gen_random_uuid()`                                                            | Generated UUID identifying this row.                                                                      |
| `staff_id`            | `UUID`        | nullable; `UNIQUE REFERENCES staff (id)`                                                                     | Optional staff sign-in link; uniqueness remains after crew soft deletion.                                 |
| `first_name`          | `TEXT`        | required; `NOT NULL`                                                                                         | First name.                                                                                               |
| `last_name`           | `TEXT`        | required; `NOT NULL`                                                                                         | Last name.                                                                                                |
| `employee_number`     | `TEXT`        | required; `NOT NULL`                                                                                         | Employee identifier unique among non-deleted crew.                                                        |
| `role`                | `TEXT`        | required; `NOT NULL CHECK (role IN ('captain', 'first_officer', 'cabin_crew', 'police'))`                    | Crew role or assignment seat: captain, first_officer, cabin_crew or police.                               |
| `date_of_birth`       | `DATE`        | nullable                                                                                                     | Date of birth.                                                                                            |
| `email`               | `TEXT`        | nullable                                                                                                     | Email.                                                                                                    |
| `phone`               | `TEXT`        | nullable                                                                                                     | Phone.                                                                                                    |
| `base_airport`        | `TEXT`        | required; `NOT NULL`; cross-FK → `airport(iata_code)`                                                        | IATA airport code; FK to airport.iata_code in Part 9.                                                     |
| `fleet_aircraft_type` | `TEXT`        | required; `NOT NULL`                                                                                         | F9 aircraft_type.model, e.g. A320, shared by layout versions; active-type validation is application-side. |
| `languages`           | `TEXT[]`      | required; `NOT NULL DEFAULT '{}' CHECK (array_to_string(languages, ',', '?') ~ '^([a-z]{2}(,[a-z]{2})*)?$')` | Lowercase two-letter language codes; empty array allowed. SQL validates array contents.                   |
| `licence_number`      | `TEXT`        | required; `NOT NULL`                                                                                         | Credential number unique among non-deleted crew; required for every crew role.                            |
| `licence_expires_on`  | `DATE`        | required; `NOT NULL`                                                                                         | Credential expiry date used by future legality checks.                                                    |
| `created_at`          | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                                                                           | Real database creation time.                                                                              |
| `updated_at`          | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                                                                           | Real last-update time; application-maintained after insertion.                                            |
| `deleted_at`          | `TIMESTAMPTZ` | nullable                                                                                                     | Soft-delete time; NULL means not deleted.                                                                 |

**Named indexes:**

- `CREATE UNIQUE INDEX crew_employee_number_uq ON crew (employee_number) WHERE deleted_at IS NULL;`
- `CREATE UNIQUE INDEX crew_licence_number_uq ON crew (licence_number) WHERE deleted_at IS NULL;`
- `CREATE INDEX crew_base_role_idx ON crew (base_airport, role) WHERE deleted_at IS NULL;`
- `CREATE INDEX crew_languages_idx ON crew USING gin (languages) WHERE deleted_at IS NULL;`

<a id="table-crew_certification"></a>

### `crew_certification`

Type ratings and other certifications. Renewal updates expires_on; audit writing is an application responsibility.

| Column          | SQL type | Constraints / linkage                             | Meaning                                                                                        |
| --------------- | -------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `id`            | `UUID`   | required; `PRIMARY KEY DEFAULT gen_random_uuid()` | Generated UUID identifying this row.                                                           |
| `crew_id`       | `UUID`   | required; `NOT NULL REFERENCES crew (id)`         | Related operational crew member.                                                               |
| `name`          | `TEXT`   | required; `NOT NULL`                              | Name.                                                                                          |
| `aircraft_type` | `TEXT`   | nullable                                          | Optional F9 aircraft_type.model for a type rating; NULL for general certifications. No SQL FK. |
| `expires_on`    | `DATE`   | required; `NOT NULL`                              | Certification expiry date; updated on renewal.                                                 |

**Named indexes:**

- `CREATE UNIQUE INDEX crew_certification_uq ON crew_certification (crew_id, name, aircraft_type) NULLS NOT DISTINCT;`

<a id="table-pairing"></a>

### `pairing`

A chain of dated flights. Leg order, duty periods, validity and totals are derived from current flight times.

| Column         | SQL type      | Constraints / linkage                                 | Meaning                                                        |
| -------------- | ------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `id`           | `UUID`        | required; `PRIMARY KEY DEFAULT gen_random_uuid()`     | Generated UUID identifying this row.                           |
| `code`         | `TEXT`        | required; `NOT NULL UNIQUE DEFAULT 'P-'               |                                                                | nextval('pairing_code_seq')` | Sequence-generated public pairing code, e.g. P-101; omit on insert. |
| `base_airport` | `TEXT`        | required; `NOT NULL`; cross-FK → `airport(iata_code)` | IATA airport code; FK to airport.iata_code in Part 9.          |
| `created_at`   | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                    | Real database creation time.                                   |
| `updated_at`   | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                    | Real last-update time; application-maintained after insertion. |

**Named indexes:**

- `CREATE INDEX pairing_base_idx ON pairing (base_airport);`

<a id="table-pairing_leg"></a>

### `pairing_leg`

A dated flight belonging to one pairing. A flight can occur in at most one pairing.

| Column       | SQL type      | Constraints / linkage                                                   | Meaning                                                                       |
| ------------ | ------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `id`         | `UUID`        | required; `PRIMARY KEY DEFAULT gen_random_uuid()`                       | Generated UUID identifying this row.                                          |
| `pairing_id` | `UUID`        | required; `NOT NULL REFERENCES pairing (id) ON DELETE CASCADE`          | Related pairing; run membership is enforced where referenced.                 |
| `flight_id`  | `UUID`        | required; `NOT NULL UNIQUE`; cross-FK → `flight(id)`                    | Dated flight reference; globally unique across pairings.                      |
| `added_by`   | `TEXT`        | required; `NOT NULL DEFAULT 'auto' CHECK (added_by IN ('auto', 'ops'))` | Leg source: auto or ops. Regeneration is intended to preserve ops-added legs. |
| `created_at` | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                                      | Real database creation time.                                                  |

**Table-level SQL constraints:**

- `UNIQUE (id, pairing_id)`

**Named indexes:**

- `CREATE INDEX pairing_leg_pairing_idx ON pairing_leg (pairing_id);`

<a id="table-roster_run"></a>

### `roster_run`

Draft or published roster for a base and date range. Publication and deletion policy require backend enforcement.

| Column         | SQL type      | Constraints / linkage                                                         | Meaning                                                                |
| -------------- | ------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `id`           | `UUID`        | required; `PRIMARY KEY DEFAULT gen_random_uuid()`                             | Generated UUID identifying this row.                                   |
| `base_airport` | `TEXT`        | required; `NOT NULL`; cross-FK → `airport(iata_code)`                         | IATA airport code; FK to airport.iata_code in Part 9.                  |
| `date_from`    | `DATE`        | required; `NOT NULL`                                                          | First calendar date covered by the run.                                |
| `date_to`      | `DATE`        | required; `NOT NULL`                                                          | Last calendar date covered; cannot precede date_from.                  |
| `status`       | `TEXT`        | required; `NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published'))` | Current allowed lifecycle state; see SQL checks.                       |
| `published_at` | `TIMESTAMPTZ` | nullable                                                                      | Simulation publication time; present exactly when status is published. |
| `created_at`   | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                                            | Real database creation time.                                           |
| `updated_at`   | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                                            | Real last-update time; application-maintained after insertion.         |

**Table-level SQL constraints:**

- `CHECK (date_to >= date_from)`
- `CHECK ((status = 'published') = (published_at IS NOT NULL))`

**Named indexes:**

- `CREATE INDEX roster_run_base_idx ON roster_run (base_airport, date_from DESC);`

<a id="table-roster_run_pairing"></a>

### `roster_run_pairing`

Pairings committed to a roster run. Each pairing can belong to only one run.

| Column          | SQL type | Constraints / linkage                               | Meaning                                                       |
| --------------- | -------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `roster_run_id` | `UUID`   | required; `NOT NULL REFERENCES roster_run (id)`     | Roster run containing this pairing.                           |
| `pairing_id`    | `UUID`   | required; `NOT NULL UNIQUE REFERENCES pairing (id)` | Related pairing; run membership is enforced where referenced. |

**Table-level SQL constraints:**

- `PRIMARY KEY (roster_run_id, pairing_id)`

<a id="table-pairing_leg_assignment"></a>

### `pairing_leg_assignment`

Crew assignment history for a leg of a pairing already committed to a run.

| Column           | SQL type      | Constraints / linkage                                                                     | Meaning                                                                     |
| ---------------- | ------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `id`             | `UUID`        | required; `PRIMARY KEY DEFAULT gen_random_uuid()`                                         | Generated UUID identifying this row.                                        |
| `pairing_id`     | `UUID`        | required; `NOT NULL REFERENCES roster_run_pairing (pairing_id)`                           | Related pairing; run membership is enforced where referenced.               |
| `pairing_leg_id` | `UUID`        | required; `NOT NULL`                                                                      | Related flight leg, constrained to the same pairing.                        |
| `crew_id`        | `UUID`        | required; `NOT NULL REFERENCES crew (id)`                                                 | Related operational crew member.                                            |
| `role`           | `TEXT`        | required; `NOT NULL CHECK (role IN ('captain', 'first_officer', 'cabin_crew', 'police'))` | Crew role or assignment seat: captain, first_officer, cabin_crew or police. |
| `assigned_by`    | `TEXT`        | required; `NOT NULL CHECK (assigned_by IN ('auto', 'ops'))`                               | Assignment source: auto or ops; not a staff ID.                             |
| `assigned_at`    | `TIMESTAMPTZ` | required; `NOT NULL`                                                                      | Simulation time of assignment; application must supply it.                  |
| `unassigned_at`  | `TIMESTAMPTZ` | nullable                                                                                  | Simulation time of removal; NULL means active. A removal requires a reason. |
| `reason`         | `TEXT`        | nullable                                                                                  | Explanation for removing an assignment; required when unassigned_at is set. |
| `created_at`     | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                                                        | Real database creation time.                                                |

**Table-level SQL constraints:**

- `FOREIGN KEY (pairing_leg_id, pairing_id) REFERENCES pairing_leg (id, pairing_id)`
- `CHECK (unassigned_at IS NULL OR reason IS NOT NULL)`

**Named indexes:**

- `CREATE UNIQUE INDEX pairing_leg_assignment_active_uq ON pairing_leg_assignment (pairing_leg_id, crew_id) WHERE unassigned_at IS NULL;`
- `CREATE UNIQUE INDEX pairing_leg_assignment_pilot_uq ON pairing_leg_assignment (pairing_leg_id, role) WHERE unassigned_at IS NULL AND role IN ('captain', 'first_officer');`
- `CREATE INDEX pairing_leg_assignment_leg_idx ON pairing_leg_assignment (pairing_leg_id);`
- `CREATE INDEX pairing_leg_assignment_pairing_idx ON pairing_leg_assignment (pairing_id);`
- `CREATE INDEX pairing_leg_assignment_crew_idx ON pairing_leg_assignment (crew_id) WHERE unassigned_at IS NULL;`

<a id="table-rule_break"></a>

### `rule_break`

Roster violations, resolutions and permitted company-rule overrides, linked to the same run/pairing/leg.

| Column            | SQL type      | Constraints / linkage                                                                                                                                                                                            | Meaning                                                                              |
| ----------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `id`              | `UUID`        | required; `PRIMARY KEY DEFAULT gen_random_uuid()`                                                                                                                                                                | Generated UUID identifying this row.                                                 |
| `roster_run_id`   | `UUID`        | required; `NOT NULL`                                                                                                                                                                                             | Roster run containing this pairing.                                                  |
| `pairing_id`      | `UUID`        | required; `NOT NULL`                                                                                                                                                                                             | Related pairing; run membership is enforced where referenced.                        |
| `pairing_leg_id`  | `UUID`        | required; `NOT NULL`                                                                                                                                                                                             | Related flight leg, constrained to the same pairing.                                 |
| `crew_id`         | `UUID`        | nullable; `REFERENCES crew (id)`                                                                                                                                                                                 | Related operational crew member.                                                     |
| `role`            | `TEXT`        | nullable; `CHECK (role IN ('captain', 'first_officer', 'cabin_crew', 'police'))`                                                                                                                                 | Crew role or assignment seat; on rule_break, populated exactly for NO_LEGAL_CREW.    |
| `rule`            | `TEXT`        | required; `NOT NULL CHECK (rule IN ( 'OVERLAP', 'REST_SHORT', 'HOURS_28D', 'DUTY_LIMIT', 'NO_LEGAL_CREW', 'LICENCE_EXPIRED', 'NO_TYPE_RATING', 'WRONG_FLEET', 'NO_LOCAL_CREW', 'POLICE_MIN', 'POLICE_NO_SEAT'))` | Violation code from the SQL whitelist.                                               |
| `detail`          | `TEXT`        | required; `NOT NULL`                                                                                                                                                                                             | Human-readable violation explanation.                                                |
| `created_at`      | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                                                                                                                                                                               | Real database creation time.                                                         |
| `resolved_at`     | `TIMESTAMPTZ` | nullable                                                                                                                                                                                                         | Simulation resolution time; present exactly when resolution is non-NULL.             |
| `resolution`      | `TEXT`        | nullable; `CHECK (resolution IN ('fixed', 'overridden'))`                                                                                                                                                        | NULL while open; fixed or overridden when resolved.                                  |
| `overridden_by`   | `UUID`        | nullable; `REFERENCES staff (id)`                                                                                                                                                                                | staff.id approving an allowed company override; audit actor uses the linked user.id. |
| `override_reason` | `TEXT`        | nullable                                                                                                                                                                                                         | Required exactly for an overridden resolution, together with overridden_by.          |

**Table-level SQL constraints:**

- `FOREIGN KEY (roster_run_id, pairing_id) REFERENCES roster_run_pairing (roster_run_id, pairing_id)`
- `FOREIGN KEY (pairing_leg_id, pairing_id) REFERENCES pairing_leg (id, pairing_id)`
- `CHECK ((rule = 'NO_LEGAL_CREW') = (role IS NOT NULL))`
- `CHECK ((resolution IS NULL) = (resolved_at IS NULL))`
- `CHECK ((resolution IS NOT DISTINCT FROM 'overridden') = (override_reason IS NOT NULL))`
- `CHECK ((resolution IS NOT DISTINCT FROM 'overridden') = (overridden_by IS NOT NULL))`
- `CHECK (resolution IS DISTINCT FROM 'overridden' OR rule IN ('NO_LOCAL_CREW', 'POLICE_MIN', 'POLICE_NO_SEAT'))`

**Named indexes:**

- `CREATE UNIQUE INDEX rule_break_open_uq ON rule_break (pairing_leg_id, rule, crew_id, role) NULLS NOT DISTINCT WHERE resolved_at IS NULL;`
- `CREATE INDEX rule_break_run_idx ON rule_break (roster_run_id, pairing_id);`
- `CREATE INDEX rule_break_run_open_idx ON rule_break (roster_run_id) WHERE resolved_at IS NULL;`

## Relationships, history and remaining application work

- `crew.base_airport`, `pairing.base_airport`, `roster_run.base_airport` → `airport.iata_code`; `pairing_leg.flight_id` → `flight.id` are SQL-enforced cross-feature FKs.
- `roster_run_pairing.pairing_id` is globally unique: a pairing belongs to at most one run. Assignment `pairing_id` references this link, and a composite FK keeps its leg in that pairing. The earlier cross-run ambiguity is addressed by this ownership model, not by adding a run ID to each assignment.
- `rule_break` references both `(roster_run_id, pairing_id)` and `(pairing_leg_id, pairing_id)`. It cannot point to a different run or pairing's leg.
- A pairing hard delete cascades only to its legs. Run membership, assignments and breaks have blocking FKs. Published-run deletion protection and transactional draft cleanup remain application requirements.
- Assignment removal is represented by `unassigned_at` plus `reason`; replacements are new rows. Partial indexes prevent duplicate active crew/leg rows and duplicate active captain/first-officer seats. They do not detect overlap across different flights.
- NULL-safe CHECKs require `resolved_at` with resolution, require both override actor and reason exactly for `overridden`, and allow overrides only for `NO_LOCAL_CREW`, `POLICE_MIN`, `POLICE_NO_SEAT`. `WRONG_FLEET` is now also an allowed rule. The partial `rule_break_open_uq` uses `NULLS NOT DISTINCT` to deduplicate open breaks even with NULL crew/role.
- Pairing closure, derived duty boundaries, 28-day hours, licences/ratings, staffing counts, country-language coverage, assignment role matching and cross-flight overlap still require a backend. SQL comments prescribe locking the crew row (`SELECT ... FOR UPDATE`) during assignment validation.
- The schema checks roster date order and published timestamp consistency. It does not enforce one run per base/range or the publish gate requiring zero open breaks. The comments describe publishing once, then making changes in place with history and notifications; no roster revision column is defined.
- Business timestamps (`assigned_at`, `unassigned_at`, `published_at`, `resolved_at`) require application simulation time. Audit/storage timestamps use real time.
- F3/F6 police seat/boarding integration, F5 overtime and F13 notifications remain contracts to implement. F15 audit writing must map override `staff.id` through `staff.user_id`, use an existing audit action, set `source_feature='8'` and mask sensitive fields. No F8 audit writer is present.

## 5. Review fixes and integration status

This section tracks the former proposal's section 5 review against the committed schema and shared feature dependencies. A resolved SQL issue does not establish that its related backend rule is implemented.

### Earlier section 5 fixes: current disposition

| Earlier review issue                        | Current SQL / repository evidence                                                                              | Remaining work                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Invalid airport(code) references            | Resolved: all three F8 base-airport FKs target airport.iata_code                                               | Verify deployed constraints separately                                      |
| Assignment ownership across roster runs     | Resolved by unique roster_run_pairing.pairing_id and assignment/run-link plus leg/pairing FKs                  | Implement transactional draft cleanup and published history policy          |
| Text fleet/type-rating references           | Current source uses F9 aircraft_type.model strings shared across layout versions                               | Validate against active F9 models in application code; no SQL FK exists     |
| Missing cabin staffing source               | crew_setting.seats_per_cabin_crew defaults to 50; comments define ceil(layout seats / divisor)                 | Implement calculation; no dedicated F9 count column exists                  |
| Country normalization                       | airport.country and F8 country columns have lowercase two-letter format CHECKs                                 | Normalize existing data before migration; populate agreed language mappings |
| Multiple nullable default legality rules    | Superseded: defaults are crew_setting keys; country_legality_rule has a non-NULL country PK                    | Implement stricter-country rule merging                                     |
| NULL-unsafe override metadata               | Resolved: NULL-safe actor/reason checks, resolution timestamp consistency and company-only override whitelist  | Implement permission checks and F15 audit writer                            |
| Missing duty boundaries                     | report_minutes=60 and release_minutes=0 inserted; duty intervals derive from flight times                      | Implement per-duty grouping, rest and rolling-hour calculations             |
| Cascading deletes / published history       | Only pairing→leg cascades; run membership and assignment/break FKs block referenced deletes                    | Backend must protect published runs and perform ordered draft deletion      |
| Revisions and post-publication changes      | Current design publishes once and changes assignments in place with unassigned_at/reason                       | Notifications and audit trail remain unimplemented; no revision column      |
| Duplicate assignments / overlap             | Active crew/leg and pilot-role partial unique indexes exist                                                    | Cross-flight overlap and concurrent checks need crew-row locking            |
| Police booking/boarding                     | No F3/F6 booking/seat integration in this schema                                                               | Agree seat allocation and boarding contract                                 |
| Licence policy / expiry warning             | Soft-delete-aware licence uniqueness and expiry_warning_days=30 exist; licence remains mandatory for all roles | Confirm credentials for police role and implement expiry checks             |
| Stored pairing validity / copied leg status | Proposed validity, duty aggregates and leg-status copies were removed                                          | Derive validity and status from current flights in application code         |
| Range and numeric checks                    | Roster date ordering and positive country rest/duty values are checked                                         | Text settings still need numeric validation; duty_day column was removed    |
| Audit actor identity                        | Override FK is staff.id; audit_log actor_id represents user.id by contract                                     | Map staff.user_id and use supported F15 actions                             |
| Simulation time                             | F8 business timestamps have no now() defaults                                                                  | Supply simulation time from application; verify at runtime                  |
| Missing F8 seeds                            | Eleven defaults inserted; no crew/certification/country-language fixtures                                      | Agree and add fixtures through a separate seed change                       |

### DBML follow-up — source needed

The supplied message says the DBML is missing “these 4”, but does not identify those items. No `.dbml` file is present in this checkout. The four missing items and the external DBML cannot be marked reviewed or fixed until their names/source are available. This is separate from the four F2 tables documented here; their identity must not be assumed. No DBML, schema or migration was changed in this Markdown-only task.

## Seeds and verification

The F8 migration inserts the 11 settings above. Neither it nor `seed.ts` inserts crew, certifications, country-language mappings, country overrides, pairings, rosters, assignments or breaks. Before runtime approval, verify migration deployment and test FK failures, NULL-safe overrides, duplicate active pilot assignments, cross-flight concurrent allocation, published history preservation and publication with unresolved breaks. Those runtime checks were not executed for this documentation update.

## Sources

- `schema.sql`, Part 8 (F8) and Part 9 (cross-feature FKs).
- `prisma/schema.prisma` and `prisma/migrations/20261024120000_feature8_crew_rostering/migration.sql` at the commit in the header.
- [Relationships & migrations](./relationships-and-migrations.md), [Seeds](./seed-data.md), [Decisions & maintenance](./decisions-and-maintenance.md).

---

[← Database documentation home](../docs.md)
