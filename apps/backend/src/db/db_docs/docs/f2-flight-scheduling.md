# F2 — Flight scheduling and network operations

> **Status: COMMITTED SCHEMA.** See the [current schema snapshot](../docs.md#current-schema-snapshot) for the verified source commit and schema totals. Committed definitions do not prove deployment or completed application behavior.

**Tables (16):** [`disruption_reason`](#table-disruption_reason) · [`partner_airline`](#table-partner_airline) · [`airport`](#table-airport) · [`airport_fee`](#table-airport_fee) · [`route`](#table-route) · [`flight_pattern`](#table-flight_pattern) · [`flight`](#table-flight) · [`flight_event`](#table-flight_event) · [`flight_event_outbox`](#table-flight_event_outbox) · [`airport_congestion`](#table-airport_congestion) · [`schedule_conflict`](#table-schedule_conflict) · [`flight_setting`](#table-flight_setting) · [`partner_airline_route`](#table-partner_airline_route) · [`airport_approval_policy`](#table-airport_approval_policy) · [`schedule_approval`](#table-schedule_approval) · [`schedule_approval_offer`](#table-schedule_approval_offer)

<a id="table-disruption_reason"></a>

### `disruption_reason`

Reference catalogue of reasons for delays, diversions, and other disruptions.

| Column        | SQL type      | Constraints / linkage                                                                                 | Meaning                                               |
| ------------- | ------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `code`        | `TEXT`        | PK; required                                                                                          | Stable short code for this record.                    |
| `category`    | `TEXT`        | required; Allowed: weather, technical, crew, air_traffic_control, security, airport_operations, other | Classification of this record.                        |
| `description` | `TEXT`        | required                                                                                              | Human-readable description or details.                |
| `is_active`   | `BOOLEAN`     | required; default `true`                                                                              | Whether the record is enabled for new use.            |
| `created_at`  | `TIMESTAMPTZ` | required; default `now()`                                                                             | Actual database creation timestamp.                   |
| `updated_at`  | `TIMESTAMPTZ` | required; default `now()`                                                                             | Last modification timestamp (application-maintained). |

<a id="table-partner_airline"></a>

### `partner_airline`

Partner airlines that can receive rebooked passengers after disruptions.

| Column       | SQL type      | Constraints / linkage     | Meaning                                               |
| ------------ | ------------- | ------------------------- | ----------------------------------------------------- |
| `code`       | `TEXT`        | PK; required              | Stable short code for this record.                    |
| `name`       | `TEXT`        | required                  | Human-readable name.                                  |
| `is_active`  | `BOOLEAN`     | required; default `true`  | Whether the record is enabled for new use.            |
| `created_at` | `TIMESTAMPTZ` | required; default `now()` | Actual database creation timestamp.                   |
| `updated_at` | `TIMESTAMPTZ` | required; default `now()` | Last modification timestamp (application-maintained). |

<a id="table-airport"></a>

### `airport`

Airport master records with IATA/ICAO codes and operating metadata.

| Column               | SQL type      | Constraints / linkage     | Meaning                                                                     |
| -------------------- | ------------- | ------------------------- | --------------------------------------------------------------------------- |
| `iata_code`          | `TEXT`        | PK; required              | Three-letter IATA airport identifier.                                       |
| `icao_code`          | `TEXT`        | required; unique          | Four-letter ICAO airport identifier.                                        |
| `name`               | `TEXT`        | required                  | Human-readable name.                                                        |
| `city`               | `TEXT`        | required                  | City where the airport is located.                                          |
| `country`            | `TEXT`        | required; CHECK           | Lowercase two-letter country code (e.g. th); SQL CHECK enforces the format. |
| `timezone`           | `TEXT`        | required                  | IANA time zone used for local flight scheduling.                            |
| `min_turnaround_min` | `INTEGER`     | required; CHECK           | Minimum permitted turnaround min.                                           |
| `is_active`          | `BOOLEAN`     | required; default `true`  | Whether the record is enabled for new use.                                  |
| `created_at`         | `TIMESTAMPTZ` | required; default `now()` | Actual database creation timestamp.                                         |
| `updated_at`         | `TIMESTAMPTZ` | required; default `now()` | Last modification timestamp (application-maintained).                       |

<a id="table-airport_fee"></a>

### `airport_fee`

Airport charges, their calculation units, applicable movement, currency, and effective dates.

**Important behavior:** Each fee applies on departure or arrival and has a unit such as per flight, hour, or tonne.

| Column           | SQL type        | Constraints / linkage                                     | Meaning                                                                           |
| ---------------- | --------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `id`             | `UUID`          | PK; required; default `gen_random_uuid()`                 | Unique identifier for this record.                                                |
| `airport`        | `TEXT`          | FK → `airport(iata_code)`; required                       | IATA code of the airport that this row applies to.                                |
| `fee_type`       | `TEXT`          | required; Allowed: landing, parking, handling, navigation | Type of airport charge (landing/parking/handling/navigation).                     |
| `applies_on`     | `TEXT`          | required; Allowed: departure, arrival                     | Flight movement to which this fee applies: `departure` or `arrival` (not a date). |
| `amount`         | `NUMERIC(12,2)` | required; CHECK                                           | Monetary amount in the stated or base currency.                                   |
| `unit`           | `TEXT`          | required; Allowed: per_flight, per_hour, per_tonne        | How the airport fee is measured: per flight, hour, or tonne.                      |
| `currency`       | `TEXT`          | required                                                  | Currency code associated with the amount.                                         |
| `effective_from` | `DATE`          | required                                                  | First calendar day this fee is applicable.                                        |
| `effective_to`   | `DATE`          | nullable                                                  | Last effective day for the fee (if specified).                                    |
| `created_at`     | `TIMESTAMPTZ`   | required; default `now()`                                 | Actual database creation timestamp.                                               |
| `updated_at`     | `TIMESTAMPTZ`   | required; default `now()`                                 | Last modification timestamp (application-maintained).                             |

**Indexes:** `airport_fee_lookup_idx` (index; `(airport, fee_type, applies_on, effective_from)`).

<a id="table-route"></a>

### `route`

Directed origin-to-destination network links with distance and planned block time.

**Important behavior:** Routes cannot start and end at the same airport; origin/destination pairs must be unique.

| Column           | SQL type      | Constraints / linkage                     | Meaning                                               |
| ---------------- | ------------- | ----------------------------------------- | ----------------------------------------------------- |
| `id`             | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                    |
| `origin`         | `TEXT`        | FK → `airport(iata_code)`; required       | Departure airport IATA code.                          |
| `destination`    | `TEXT`        | FK → `airport(iata_code)`; required       | Arrival airport IATA code.                            |
| `distance_km`    | `INTEGER`     | required; CHECK                           | Route distance in kilometres.                         |
| `block_time_min` | `INTEGER`     | required; CHECK                           | Gate-to-gate minutes.                                 |
| `is_active`      | `BOOLEAN`     | required; default `true`                  | Whether the record is enabled for new use.            |
| `created_at`     | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp.                   |
| `updated_at`     | `TIMESTAMPTZ` | required; default `now()`                 | Last modification timestamp (application-maintained). |

**Table-level SQL constraints:** `UNIQUE (origin, destination)` · `CHECK (origin <> destination)`

**Indexes:** `route_destination_idx` (index; `(destination)`).

<a id="table-flight_pattern"></a>

### `flight_pattern`

Repeating service definitions by route, local departure time, weekday, and validity period.

**Important behavior:** `days_of_week` uses 1=Monday through 7=Sunday at the origin airport. `flight_number` is unique.

| Column           | SQL type      | Constraints / linkage                     | Meaning                                               |
| ---------------- | ------------- | ----------------------------------------- | ----------------------------------------------------- |
| `id`             | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                    |
| `route_id`       | `UUID`        | FK → `route(id)`; required                | Related route identifier.                             |
| `flight_number`  | `TEXT`        | required; unique                          | Airline code (flight_setting) plus 1 to 4 digits.     |
| `dep_time_local` | `TIME`        | required                                  | Local departure clock time at origin airport.         |
| `days_of_week`   | `SMALLINT[]`  | required                                  | Operating weekdays, Monday=1 to Sunday=7.             |
| `valid_from`     | `DATE`        | required                                  | First time/date this record becomes valid.            |
| `valid_to`       | `DATE`        | required                                  | Time/date after which this record is no longer valid. |
| `created_at`     | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp.                   |
| `updated_at`     | `TIMESTAMPTZ` | required; default `now()`                 | Last modification timestamp (application-maintained). |

**Table-level SQL constraints:** `CHECK (valid_to >= valid_from)`

**Indexes:** `flight_pattern_route_idx` (index; `(route_id)`).

<a id="table-flight"></a>

### `flight`

Individual dated flight service, with scheduled and current expected times, aircraft, and status.

**Important behavior:** `scheduled_*` are timetable values; `dep_at`/`arr_at` are current expectations after delays. `service_date` remains the original departure date. A GiST exclusion constraint blocks overlapping scheduled flights assigned to one non-cancelled aircraft, but does **not** block overlaps in updated expected times.

| Column               | SQL type      | Constraints / linkage                                                                                         | Meaning                                                             |
| -------------------- | ------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `id`                 | `UUID`        | PK; required; default `gen_random_uuid()`                                                                     | Unique identifier for this record.                                  |
| `pattern_id`         | `UUID`        | FK → `flight_pattern(id)`; nullable                                                                           | Optional repeating flight pattern that generated the dated service. |
| `flight_number`      | `TEXT`        | required                                                                                                      | Airline flight identifier.                                          |
| `service_date`       | `DATE`        | required                                                                                                      | Original origin-local service date, unchanged by overnight delays.  |
| `route_id`           | `UUID`        | FK → `route(id)`; required                                                                                    | Related route identifier.                                           |
| `scheduled_dep_at`   | `TIMESTAMPTZ` | required                                                                                                      | Published departure time, modified by a reschedule.                 |
| `scheduled_arr_at`   | `TIMESTAMPTZ` | required                                                                                                      | Published arrival time, modified by a reschedule.                   |
| `dep_at`             | `TIMESTAMPTZ` | required                                                                                                      | Current expected departure time, including delays.                  |
| `arr_at`             | `TIMESTAMPTZ` | required                                                                                                      | Current expected arrival time, including delays.                    |
| `actual_destination` | `TEXT`        | FK → `airport(iata_code)`; nullable                                                                           | Airport code after diversion; NULL uses planned route destination.  |
| `aircraft_id`        | `UUID`        | cross-FK → `aircraft(id)`; required                                                                           | Aircraft assigned to this instance (F9).                            |
| `status`             | `TEXT`        | required; default `'scheduled'`; Allowed: scheduled, delayed, holding, diverted, cancelled, departed, arrived | Current lifecycle status.                                           |
| `created_at`         | `TIMESTAMPTZ` | required; default `now()`                                                                                     | Actual database creation timestamp.                                 |
| `updated_at`         | `TIMESTAMPTZ` | required; default `now()`                                                                                     | Last modification timestamp (application-maintained).               |

**Table-level SQL constraints:** `UNIQUE (flight_number, service_date)` · `CHECK (scheduled_arr_at > scheduled_dep_at)` · `CHECK (arr_at > dep_at)` · `CONSTRAINT flight_timetable_no_aircraft_overlap EXCLUDE USING gist ( aircraft_id WITH =, tstzrange(scheduled_dep_at, scheduled_arr_at) WITH && ) WHERE (status <> 'cancelled')`

**Indexes:** `flight_route_dep_idx` (index; `(route_id, dep_at)`); `flight_dep_at_idx` (index; `(dep_at)`); `flight_arr_at_idx` (index; `(arr_at)`); `flight_aircraft_dep_idx` (index; `(aircraft_id, dep_at)`); `flight_status_dep_idx` (index; `(status, dep_at)`); `flight_pattern_idx` (index; `(pattern_id) WHERE pattern_id IS NOT NULL`).

**Cross-feature linkage:** `aircraft_id` → `aircraft(id)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-flight_event"></a>

### `flight_event`

Immutable record of a flight schedule/status change and the circumstances of that change.

**Important behavior:** The global `seq` orders inserts; it is not a safe checkpoint across different flights. Rows cannot be updated or deleted via the trigger. Business event shape requires backend validation; no feature handler is present in this checkout.

| Column                   | SQL type      | Constraints / linkage                                                                                                           | Meaning                                                                        |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `id`                     | `UUID`        | PK; required; default `gen_random_uuid()`                                                                                       | Unique identifier for this record.                                             |
| `seq`                    | `BIGINT`      | required; unique; GENERATED ALWAYS AS IDENTITY (omit on insert)                                                                 | Global insertion sequence; not guaranteed to follow cross-flight commit order. |
| `flight_id`              | `UUID`        | FK → `flight(id)`; required                                                                                                     | Related dated flight identifier.                                               |
| `type`                   | `TEXT`        | required; Allowed: created, delayed, rescheduled, aircraft_changed, holding, hold_ended, diverted, cancelled, departed, arrived | Record/event category.                                                         |
| `disruption_reason_code` | `TEXT`        | FK → `disruption_reason(code)`; nullable                                                                                        | Code identifying disruption reason.                                            |
| `delay_minutes`          | `INTEGER`     | nullable; CHECK                                                                                                                 | Incremental minutes for this event, not accumulated delay.                     |
| `old_dep_at`             | `TIMESTAMPTZ` | nullable                                                                                                                        | Previous expected departure time recorded by this change.                      |
| `new_dep_at`             | `TIMESTAMPTZ` | nullable                                                                                                                        | Replacement expected departure time recorded by this change.                   |
| `old_arr_at`             | `TIMESTAMPTZ` | nullable                                                                                                                        | Previous expected arrival time recorded by this change.                        |
| `new_arr_at`             | `TIMESTAMPTZ` | nullable                                                                                                                        | Replacement expected arrival time recorded by this change.                     |
| `new_destination`        | `TEXT`        | FK → `airport(iata_code)`; nullable                                                                                             | Airport code used after a diversion.                                           |
| `old_aircraft_id`        | `UUID`        | cross-FK → `aircraft(id)`; nullable                                                                                             | Aircraft assigned before this change.                                          |
| `new_aircraft_id`        | `UUID`        | cross-FK → `aircraft(id)`; nullable                                                                                             | Aircraft assigned after this change.                                           |
| `hold_minutes`           | `INTEGER`     | nullable; CHECK                                                                                                                 | Duration of a holding event, in minutes.                                       |
| `resolution`             | `TEXT`        | nullable; Allowed: refund, rebook_partner                                                                                       | Disruption resolution: refund or partner rebooking.                            |
| `partner_airline`        | `TEXT`        | FK → `partner_airline(code)`; nullable                                                                                          | Code for the partner airline accepting rebooking.                              |
| `note`                   | `TEXT`        | nullable                                                                                                                        | Additional free-text note.                                                     |
| `actor_id`               | `UUID`        | FK → `staff(id)`; nullable                                                                                                      | Staff who performed action; NULL indicates system event.                       |
| `occurred_at`            | `TIMESTAMPTZ` | required                                                                                                                        | Time the event happened on the simulated clock.                                |

**Indexes:** `flight_event_flight_idx` (index; `(flight_id, seq)`); `flight_event_occurred_idx` (index; `(occurred_at)`); `flight_event_reason_idx` (index; `(disruption_reason_code, occurred_at)`).

**Cross-feature linkage:** `old_aircraft_id` → `aircraft(id)`; `new_aircraft_id` → `aircraft(id)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-flight_event_outbox"></a>

### `flight_event_outbox`

Message delivery tracking for immutable flight events; supports reliable event publication.

**Important behavior:** Application requirement: insert in the same transaction as `flight_event`; a future publication worker must record attempts, failures and publication time. That worker is not implemented here.

| Column         | SQL type      | Constraints / linkage                 | Meaning                                                    |
| -------------- | ------------- | ------------------------------------- | ---------------------------------------------------------- |
| `event_id`     | `UUID`        | PK; FK → `flight_event(id)`; required | Same primary key as flight_event event ID.                 |
| `published_at` | `TIMESTAMPTZ` | nullable                              | Simulation time the event was accepted by the message bus. |
| `attempts`     | `INTEGER`     | required; default `0`                 | Number of publication attempts.                            |
| `last_error`   | `TEXT`        | nullable                              | Most recent publish failure message.                       |

**Indexes:** `flight_event_outbox_pending_idx` (index; `(event_id) WHERE published_at IS NULL`).

<a id="table-airport_congestion"></a>

### `airport_congestion`

Time windows representing reduced airport movement capacity and their causes.

**Important behavior:** Overlapping congestion windows for one airport are checked by backend; the SQL directly checks only that end follows start.

| Column                   | SQL type      | Constraints / linkage                     | Meaning                                                                             |
| ------------------------ | ------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `id`                     | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                                                  |
| `airport`                | `TEXT`        | FK → `airport(iata_code)`; required       | IATA code of the airport that this row applies to.                                  |
| `starts_at`              | `TIMESTAMPTZ` | required                                  | Beginning of the congestion window in simulated time.                               |
| `ends_at`                | `TIMESTAMPTZ` | required                                  | End of the congestion window in simulated time.                                     |
| `max_movement_per_hour`  | `INTEGER`     | required; CHECK                           | Capacity limit on takeoff and landing movements per hour in this congestion window. |
| `disruption_reason_code` | `TEXT`        | FK → `disruption_reason(code)`; required  | Code identifying disruption reason.                                                 |
| `created_by`             | `UUID`        | FK → `staff(id)`; nullable                | Staff member responsible for creating this record.                                  |
| `created_at`             | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp.                                                 |
| `updated_at`             | `TIMESTAMPTZ` | required; default `now()`                 | Last modification timestamp (application-maintained).                               |

**Table-level SQL constraints:** `CHECK (ends_at > starts_at)`

**Indexes:** `airport_congestion_airport_idx` (index; `(airport, starts_at)`).

<a id="table-schedule_conflict"></a>

### `schedule_conflict`

Detected scheduling problems and their resolution, dismissal, or supersession history.

**Important behavior:** At most one **open** record per flight/kind. `facts` provides structured inputs for the conflict-resolution logic.

| Column                | SQL type      | Constraints / linkage                                                                             | Meaning                                                                           |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `id`                  | `UUID`        | PK; required; default `gen_random_uuid()`                                                         | Unique identifier for this record.                                                |
| `flight_id`           | `UUID`        | FK → `flight(id)`; required                                                                       | Related dated flight identifier.                                                  |
| `kind`                | `TEXT`        | required; Allowed: aircraft_unavailable, aircraft_position, turnaround_short, congestion, cascade | Subcategory defining how this row behaves.                                        |
| `detail`              | `TEXT`        | required                                                                                          | The exact rule that failed, for people.                                           |
| `facts`               | `JSONB`       | required; default `'{}'::jsonb`                                                                   | The same rule as numbers, for the options logic.                                  |
| `status`              | `TEXT`        | required; default `'open'`; Allowed: open, resolved, dismissed, superseded                        | Current lifecycle status.                                                         |
| `detected_at`         | `TIMESTAMPTZ` | required                                                                                          | Timestamp when detected occurred (see simulation-time conventions if applicable). |
| `caused_by_event_id`  | `UUID`        | FK → `flight_event(id)`; nullable                                                                 | Identifier of the related caused by event.                                        |
| `resolution`          | `TEXT`        | nullable; Allowed: change_aircraft, reschedule, cancel_refund, rebook_partner                     | Selected course of action used to resolve the issue.                              |
| `partner_airline`     | `TEXT`        | FK → `partner_airline(code)`; nullable                                                            | Code for the partner airline accepting rebooking.                                 |
| `resolution_event_id` | `UUID`        | FK → `flight_event(id)`; nullable                                                                 | Identifier of the related resolution event.                                       |
| `resolved_by`         | `UUID`        | FK → `staff(id)`; nullable                                                                        | Staff member who closed or resolved the issue.                                    |
| `resolved_at`         | `TIMESTAMPTZ` | nullable                                                                                          | Timestamp when resolved occurred (see simulation-time conventions if applicable). |
| `created_at`          | `TIMESTAMPTZ` | required; default `now()`                                                                         | Actual database creation timestamp.                                               |
| `updated_at`          | `TIMESTAMPTZ` | required; default `now()`                                                                         | Last modification timestamp (application-maintained).                             |

**Table-level SQL constraints:** `CHECK ((status = 'resolved') = (resolution IS NOT NULL))` · `CHECK (resolution IS DISTINCT FROM 'rebook_partner' OR partner_airline IS NOT NULL)`

**Indexes:** `schedule_conflict_open_uq` (unique; `(flight_id, kind) WHERE status = 'open'`); `schedule_conflict_open_idx` (index; `(detected_at) WHERE status = 'open'`); `schedule_conflict_flight_idx` (index; `(flight_id)`).

<a id="table-flight_setting"></a>

### `flight_setting`

Flight-module configuration key/value settings such as airline code and holding limit.

**Important behavior:** Schema inserts `holding_limit_minutes=30`, `approval_mode=auto` and `approval_response_delay_minutes=0`; `airline_code` must be seeded separately. Setting value validation and approval state transitions require application logic.

| Column       | SQL type      | Constraints / linkage                                                                                      | Meaning                                               |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `key`        | `TEXT`        | PK; required; Allowed: holding_limit_minutes, airline_code, approval_mode, approval_response_delay_minutes | Configuration key.                                    |
| `value`      | `TEXT`        | required                                                                                                   | Setting or measured value.                            |
| `updated_at` | `TIMESTAMPTZ` | required; default `now()`                                                                                  | Last modification timestamp (application-maintained). |
| `updated_by` | `UUID`        | FK → `staff(id)`; nullable                                                                                 | Staff member who last changed this setting.           |

## F8 integration

The committed F8 `pairing_leg.flight_id` references F2 `flight.id`; crew, pairing and roster base-airport FKs target `airport.iata_code`. `airport.country` is now constrained to lowercase two-letter codes. Rechecking rosters after flight changes remains an application integration requirement. `departed` and `arrived` are allowed event types; a simulation-clock event writer is not implemented in this checkout. See [F8 dictionary](./f8-crew-management-and-rostering.md).

<a id="table-partner_airline_route"></a>

### `partner_airline_route`

Demo partner-airline route coverage used when offering partner rebooking.

| Column            | SQL type | Constraints / linkage                                  | Meaning                                               |
| ----------------- | -------- | ------------------------------------------------------ | ----------------------------------------------------- |
| `partner_airline` | `TEXT`   | required; `NOT NULL REFERENCES partner_airline (code)` | Partner airline code; SQL FK to partner_airline.code. |
| `route_id`        | `UUID`   | required; `NOT NULL REFERENCES route (id)`             | Directed route.id; SQL-enforced FK.                   |

**Table-level SQL constraints:**

- `PRIMARY KEY (partner_airline, route_id)`

**Named indexes:**

- `CREATE INDEX partner_airline_route_route_idx ON partner_airline_route (route_id);`

<a id="table-airport_approval_policy"></a>

### `airport_approval_policy`

Simulated approval policy per origin airport. Curfew clock times are local to that airport.

| Column                   | SQL type      | Constraints / linkage                                                           | Meaning                                                                 |
| ------------------------ | ------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `airport`                | `TEXT`        | required; `PRIMARY KEY REFERENCES airport (iata_code)`                          | Airport IATA code; SQL FK to airport.iata_code.                         |
| `curfew_start_local`     | `TIME`        | nullable                                                                        | Start of local curfew; paired with curfew_end_local; may wrap midnight. |
| `curfew_end_local`       | `TIME`        | nullable                                                                        | End of local curfew; both curfew fields NULL means no curfew.           |
| `max_departure_per_hour` | `INTEGER`     | nullable; `CHECK (max_departure_per_hour > 0)`                                  | Positive simulated departure capacity; NULL means no configured cap.    |
| `offer_style`            | `TEXT`        | required; `NOT NULL DEFAULT 'slots' CHECK (offer_style IN ('window', 'slots'))` | Simulated response style: window or slots.                              |
| `created_at`             | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                                              | Real database creation time.                                            |
| `updated_at`             | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                                              | Real last-update time; application-maintained after insertion.          |

**Table-level SQL constraints:**

- `CHECK ((curfew_start_local IS NULL) = (curfew_end_local IS NULL))`
- `CHECK (curfew_start_local <> curfew_end_local)`

<a id="table-schedule_approval"></a>

### `schedule_approval`

Snapshot of a proposed new flight or reschedule and its approval response; this is not a searchable flight.

| Column                     | SQL type      | Constraints / linkage                                                                                                                                     | Meaning                                                                           |
| -------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `id`                       | `UUID`        | required; `PRIMARY KEY DEFAULT gen_random_uuid()`                                                                                                         | Generated UUID identifying this row.                                              |
| `purpose`                  | `TEXT`        | required; `NOT NULL CHECK (purpose IN ('new_flight', 'reschedule'))`                                                                                      | new_flight or reschedule.                                                         |
| `flight_id`                | `UUID`        | nullable; `REFERENCES flight (id)`                                                                                                                        | Dated flight reference; on approvals required exactly for reschedule.             |
| `pattern_id`               | `UUID`        | nullable; `REFERENCES flight_pattern (id)`                                                                                                                | Pattern id.                                                                       |
| `route_id`                 | `UUID`        | required; `NOT NULL REFERENCES route (id)`                                                                                                                | Directed route.id; SQL-enforced FK.                                               |
| `flight_number`            | `TEXT`        | required; `NOT NULL`                                                                                                                                      | Flight number.                                                                    |
| `service_date`             | `DATE`        | required; `NOT NULL`                                                                                                                                      | Service date.                                                                     |
| `aircraft_id`              | `UUID`        | required; `NOT NULL`; cross-FK → `aircraft(id)`                                                                                                           | F9 aircraft.id; SQL-enforced cross-feature FK on schedule approvals.              |
| `proposed_dep_at`          | `TIMESTAMPTZ` | required; `NOT NULL`                                                                                                                                      | Proposed departure instant; not yet an approved flight.                           |
| `proposed_arr_at`          | `TIMESTAMPTZ` | required; `NOT NULL`                                                                                                                                      | Proposed arrival instant; must follow proposed departure.                         |
| `approver_type`            | `TEXT`        | required; `NOT NULL CHECK (approver_type IN ('airport', 'partner_airline'))`                                                                              | airport or partner_airline; determines the required approver FK.                  |
| `approver_airport`         | `TEXT`        | nullable; `REFERENCES airport (iata_code)`                                                                                                                | Airport answering the request; present exactly for airport approvers.             |
| `approver_partner_airline` | `TEXT`        | nullable; `REFERENCES partner_airline (code)`                                                                                                             | Partner airline answering; present exactly for partner-airline approvers.         |
| `status`                   | `TEXT`        | required; `NOT NULL DEFAULT 'pending' CHECK (status IN ( 'pending', 'approved', 'alternative_offered', 'rejected', 'superseded', 'consumed', 'expired'))` | Current allowed lifecycle state; see SQL checks.                                  |
| `reject_reason`            | `TEXT`        | nullable; `CHECK (reject_reason IN ('curfew', 'no_slot_available', 'capacity_full', 'other'))`                                                            | Present exactly when rejected: curfew, no_slot_available, capacity_full or other. |
| `response_note`            | `TEXT`        | nullable                                                                                                                                                  | Response note.                                                                    |
| `previous_approval_id`     | `UUID`        | nullable; `REFERENCES schedule_approval (id)`                                                                                                             | Earlier request revised by this row; NULL exactly for revision 1.                 |
| `covered_by_approval_id`   | `UUID`        | nullable; `REFERENCES schedule_approval (id)`                                                                                                             | Earlier offer covering this time; requires a previous request.                    |
| `revision`                 | `INTEGER`     | required; `NOT NULL DEFAULT 1 CHECK (revision > 0)`                                                                                                       | Positive revision number; revision 1 has no previous request.                     |
| `requested_by`             | `UUID`        | nullable; `REFERENCES staff (id)`                                                                                                                         | Requesting staff member; nullable for system requests.                            |
| `requested_at`             | `TIMESTAMPTZ` | required; `NOT NULL`                                                                                                                                      | Simulation request time, supplied by application.                                 |
| `respond_by`               | `TIMESTAMPTZ` | nullable                                                                                                                                                  | Simulation expiry deadline; optional stretch functionality.                       |
| `responded_by`             | `UUID`        | nullable; `REFERENCES staff (id)`                                                                                                                         | Responding staff; NULL for the automatic approver.                                |
| `responded_at`             | `TIMESTAMPTZ` | nullable                                                                                                                                                  | Simulation response time; required for rejection or an alternative offer.         |
| `resulting_flight_id`      | `UUID`        | nullable; `REFERENCES flight (id)`                                                                                                                        | Created/updated flight reference; present exactly when consumed.                  |
| `created_at`               | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                                                                                                                        | Real database creation time.                                                      |
| `updated_at`               | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                                                                                                                        | Real last-update time; application-maintained after insertion.                    |

**Table-level SQL constraints:**

- `CHECK (proposed_arr_at > proposed_dep_at)`
- `CHECK ((approver_type = 'airport') = (approver_airport IS NOT NULL))`
- `CHECK ((approver_type = 'partner_airline') = (approver_partner_airline IS NOT NULL))`
- `CHECK ((purpose = 'reschedule') = (flight_id IS NOT NULL))`
- `CHECK ((status = 'rejected') = (reject_reason IS NOT NULL))`
- `CHECK ((status = 'consumed') = (resulting_flight_id IS NOT NULL))`
- `CHECK ((revision = 1) = (previous_approval_id IS NULL))`
- `CHECK (covered_by_approval_id IS NULL OR previous_approval_id IS NOT NULL)`
- `CHECK (status <> 'pending' OR (responded_at IS NULL AND responded_by IS NULL))`
- `CHECK (status NOT IN ('alternative_offered', 'rejected') OR responded_at IS NOT NULL)`
- `CHECK (responded_by IS NULL OR responded_at IS NOT NULL)`

**Named indexes:**

- `CREATE UNIQUE INDEX schedule_approval_live_uq ON schedule_approval (flight_number, service_date) WHERE status IN ('pending', 'approved', 'alternative_offered');`
- `CREATE INDEX schedule_approval_flight_number_idx ON schedule_approval (flight_number, service_date);`
- `CREATE INDEX schedule_approval_pending_idx ON schedule_approval (requested_at) WHERE status = 'pending';`
- `CREATE INDEX schedule_approval_flight_idx ON schedule_approval (flight_id) WHERE flight_id IS NOT NULL;`
- `CREATE INDEX schedule_approval_resulting_flight_idx ON schedule_approval (resulting_flight_id) WHERE resulting_flight_id IS NOT NULL;`
- `CREATE INDEX schedule_approval_route_idx ON schedule_approval (route_id);`
- `CREATE INDEX schedule_approval_previous_idx ON schedule_approval (previous_approval_id) WHERE previous_approval_id IS NOT NULL;`

<a id="table-schedule_approval_offer"></a>

### `schedule_approval_offer`

Alternative departure times: a window has an inclusive end; a slot has no end.

| Column        | SQL type      | Constraints / linkage                                   | Meaning                                                               |
| ------------- | ------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| `id`          | `UUID`        | required; `PRIMARY KEY DEFAULT gen_random_uuid()`       | Generated UUID identifying this row.                                  |
| `approval_id` | `UUID`        | required; `NOT NULL REFERENCES schedule_approval (id)`  | Parent schedule approval request.                                     |
| `kind`        | `TEXT`        | required; `NOT NULL CHECK (kind IN ('window', 'slot'))` | window or slot; determines whether ends_at must be supplied.          |
| `starts_at`   | `TIMESTAMPTZ` | required; `NOT NULL`                                    | Offered departure instant or beginning of inclusive departure window. |
| `ends_at`     | `TIMESTAMPTZ` | nullable                                                | Inclusive window end; NULL exactly for a slot.                        |
| `created_at`  | `TIMESTAMPTZ` | required; `NOT NULL DEFAULT now()`                      | Real database creation time.                                          |

**Table-level SQL constraints:**

- `UNIQUE (approval_id, starts_at)`
- `CHECK ((kind = 'window') = (ends_at IS NOT NULL))`
- `CHECK (ends_at IS NULL OR ends_at > starts_at)`

---

[← Database documentation home](../docs.md) · [Seed data](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
