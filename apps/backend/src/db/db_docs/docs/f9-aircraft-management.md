# F9 — Aircraft management

> **Status: COMMITTED SCHEMA — inventory checked 27 Oct 2026 against `dev` commit `46a7f55be46a2237545869cbec356cd61e5a31d6`.** The SQL and Prisma table/column inventories match: **84 tables / 772 columns**, including F2 approvals, F8 crew/rostering and F7 screening Iteration-03. Committed migrations do not prove deployment or completed application behavior.

**Tables (8):** [`aircraft_type`](#table-aircraft_type) · [`aircraft`](#table-aircraft) · [`aircraft_status_period`](#table-aircraft_status_period) · [`aircraft_maintenance`](#table-aircraft_maintenance) · [`aircraft_operating_day`](#table-aircraft_operating_day) · [`aircraft_turnaround`](#table-aircraft_turnaround) · [`aircraft_turnaround_task`](#table-aircraft_turnaround_task) · [`fleet_setting`](#table-fleet_setting)

<a id="table-aircraft_type"></a>

### `aircraft_type`

Aircraft model, operational limits, seat layout, and operating-cost reference.

**Important behavior:** Seat layout is JSONB. A trigger prevents in-place layout changes; a different layout requires a new aircraft type code.

| Column                    | SQL type        | Constraints / linkage                     | Meaning                                                     |
| ------------------------- | --------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `id`                      | `UUID`          | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                          |
| `code`                    | `TEXT`          | required                                  | 'A320', or 'A320-V2' for a new layout.                      |
| `manufacturer`            | `TEXT`          | required                                  | Company that manufactures the aircraft type.                |
| `model`                   | `TEXT`          | required                                  | Manufacturer’s model name for the aircraft type.            |
| `layout`                  | `JSONB`         | required                                  | JSON seat-layout definition, immutable after type creation. |
| `hold_weight_limit_kg`    | `INTEGER`       | required; CHECK                           | Weight measure for hold weight limit in kilograms.          |
| `max_takeoff_weight_kg`   | `INTEGER`       | required; CHECK                           | Maximum takeoff weight; used for per-tonne airport fees.    |
| `max_range_km`            | `INTEGER`       | required; CHECK                           | Maximum permitted range km.                                 |
| `min_turnaround_minutes`  | `INTEGER`       | required; CHECK                           | Minimum permitted turnaround minutes.                       |
| `operating_cost_per_hour` | `NUMERIC(12,2)` | required; CHECK                           | Operating cost per scheduled block hour.                    |
| `cost_currency`           | `TEXT`          | required                                  | Currency used for the aircraft operating-cost amount.       |
| `is_active`               | `BOOLEAN`       | required; default `true`                  | Retire a type without deleting it.                          |
| `created_at`              | `TIMESTAMPTZ`   | required; default `now()`                 | Actual database creation timestamp.                         |
| `updated_at`              | `TIMESTAMPTZ`   | required; default `now()`                 | Last modification timestamp (application-maintained).       |
| `deleted_at`              | `TIMESTAMPTZ`   | nullable                                  | Soft-delete timestamp; NULL means not deleted.              |

**Indexes:** `aircraft_type_code_uq` (unique; `(code) WHERE deleted_at IS NULL`).

<a id="table-aircraft"></a>

### `aircraft`

Individual registered aircraft and its type, service dates, and base airport.

**Important behavior:** `tail_number` is the registration; there is intentionally no separate `registration` column. Uniqueness applies to non-deleted aircraft.

| Column                    | SQL type      | Constraints / linkage                     | Meaning                                               |
| ------------------------- | ------------- | ----------------------------------------- | ----------------------------------------------------- |
| `id`                      | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                    |
| `tail_number`             | `TEXT`        | required                                  | Registered tail identifier of one physical aircraft.  |
| `aircraft_type_id`        | `UUID`        | FK → `aircraft_type(id)`; required        | Identifier of the related aircraft type.              |
| `entry_into_service_date` | `DATE`        | required                                  | Calendar date of entry into service.                  |
| `retired_on`              | `DATE`        | nullable                                  | Last day in the fleet; NULL = still flying.           |
| `base_airport_code`       | `TEXT`        | cross-FK → `airport(iata_code)`; required | IATA code of the aircraft’s home/base airport.        |
| `created_at`              | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp.                   |
| `updated_at`              | `TIMESTAMPTZ` | required; default `now()`                 | Last modification timestamp (application-maintained). |
| `deleted_at`              | `TIMESTAMPTZ` | nullable                                  | Soft-delete timestamp; NULL means not deleted.        |

**Indexes:** `aircraft_tail_number_uq` (unique; `(tail_number) WHERE deleted_at IS NULL`); `aircraft_type_idx` (index; `(aircraft_type_id)`); `aircraft_base_idx` (index; `(base_airport_code)`).

**Cross-feature linkage:** `base_airport_code` → `airport(iata_code)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-aircraft_status_period"></a>

### `aircraft_status_period`

Date-ranged aircraft availability or grounding/maintenance status.

**Important behavior:** A missing date-period means the aircraft may be in service. A GiST constraint prevents overlapping non-deleted periods. `end_date` is inclusive.

| Column        | SQL type      | Constraints / linkage                                      | Meaning                                                         |
| ------------- | ------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| `id`          | `UUID`        | PK; required; default `gen_random_uuid()`                  | Unique identifier for this record.                              |
| `aircraft_id` | `UUID`        | FK → `aircraft(id)`; required                              | Related aircraft identifier.                                    |
| `status`      | `TEXT`        | required; Allowed: in_service, grounded, in_maintenance    | Current lifecycle status.                                       |
| `origin`      | `TEXT`        | required; default `'manual'`; Allowed: manual, maintenance | Whether the period is manual or created by maintenance.         |
| `reason`      | `TEXT`        | nullable                                                   | Human-readable cause or explanation.                            |
| `start_date`  | `DATE`        | required                                                   | First calendar date of this period.                             |
| `end_date`    | `DATE`        | nullable                                                   | Inclusive final unavailable/status date; NULL means open-ended. |
| `created_by`  | `UUID`        | FK → `staff(id)`; required                                 | Staff member responsible for creating this record.              |
| `created_at`  | `TIMESTAMPTZ` | required; default `now()`                                  | Actual database creation timestamp.                             |
| `updated_at`  | `TIMESTAMPTZ` | required; default `now()`                                  | Last modification timestamp (application-maintained).           |
| `deleted_at`  | `TIMESTAMPTZ` | nullable                                                   | Soft-delete timestamp; NULL means not deleted.                  |

**Table-level SQL constraints:** `CHECK (end_date IS NULL OR end_date >= start_date)` · `EXCLUDE USING gist ( aircraft_id WITH =, daterange(start_date, end_date, '[]') WITH && ) WHERE (deleted_at IS NULL)`

<a id="table-aircraft_maintenance"></a>

### `aircraft_maintenance`

Planned and actual maintenance windows linked to the aircraft status period.

**Important behavior:** Links exactly one availability status period; status/timing synchronization with that period is backend-managed.

| Column               | SQL type      | Constraints / linkage                                                              | Meaning                                                             |
| -------------------- | ------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `id`                 | `UUID`        | PK; required; default `gen_random_uuid()`                                          | Unique identifier for this record.                                  |
| `aircraft_id`        | `UUID`        | FK → `aircraft(id)`; required                                                      | Related aircraft identifier.                                        |
| `maintenance_type`   | `TEXT`        | required; Allowed: a_check, b_check, c_check, d_check, unscheduled                 | Type of inspection or maintenance check.                            |
| `planned_start_date` | `DATE`        | required                                                                           | Calendar date of planned start.                                     |
| `planned_end_date`   | `DATE`        | required                                                                           | Last day the aircraft is unavailable.                               |
| `actual_end_date`    | `DATE`        | nullable                                                                           | Actual completion date; required for completed maintenance.         |
| `status`             | `TEXT`        | required; default `'planned'`; Allowed: planned, in_progress, completed, cancelled | Current lifecycle status.                                           |
| `status_period_id`   | `UUID`        | FK → `aircraft_status_period(id)`; required; unique                                | Matching availability/status period representing maintenance dates. |
| `created_by`         | `UUID`        | FK → `staff(id)`; required                                                         | Staff member responsible for creating this record.                  |
| `created_at`         | `TIMESTAMPTZ` | required; default `now()`                                                          | Actual database creation timestamp.                                 |
| `updated_at`         | `TIMESTAMPTZ` | required; default `now()`                                                          | Last modification timestamp (application-maintained).               |
| `deleted_at`         | `TIMESTAMPTZ` | nullable                                                                           | Soft-delete timestamp; NULL means not deleted.                      |

**Table-level SQL constraints:** `CHECK (planned_end_date >= planned_start_date)` · `CHECK (status <> 'completed' OR actual_end_date IS NOT NULL)`

**Indexes:** `aircraft_maintenance_aircraft_idx` (index; `(aircraft_id, planned_start_date DESC)`).

<a id="table-aircraft_operating_day"></a>

### `aircraft_operating_day`

Weekday availability specification for an individual aircraft.

**Important behavior:** If no operating-day rows exist, the aircraft is not restricted by weekday. Composite primary key.

| Column        | SQL type   | Constraints / linkage             | Meaning                      |
| ------------- | ---------- | --------------------------------- | ---------------------------- |
| `aircraft_id` | `UUID`     | PK; FK → `aircraft(id)`; required | Related aircraft identifier. |
| `day_of_week` | `SMALLINT` | PK; required; CHECK               | 1 = Monday.                  |

**Table-level SQL constraints:** `PRIMARY KEY (aircraft_id, day_of_week)`

<a id="table-aircraft_turnaround"></a>

### `aircraft_turnaround`

Ground-service session that starts when an aircraft lands after a flight.

**Important behavior:** One active turnaround per flight, enforced by a partial unique index. Readiness is derived from tasks, not stored.

| Column         | SQL type      | Constraints / linkage                     | Meaning                                        |
| -------------- | ------------- | ----------------------------------------- | ---------------------------------------------- |
| `id`           | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.             |
| `aircraft_id`  | `UUID`        | FK → `aircraft(id)`; required             | Related aircraft identifier.                   |
| `flight_id`    | `UUID`        | cross-FK → `flight(id)`; required         | Related dated flight identifier.               |
| `airport_code` | `TEXT`        | cross-FK → `airport(iata_code)`; required | Where it actually landed (cross-module FK).    |
| `arrived_at`   | `TIMESTAMPTZ` | required                                  | Simulation clock.                              |
| `created_at`   | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp.            |
| `deleted_at`   | `TIMESTAMPTZ` | nullable                                  | Soft-delete timestamp; NULL means not deleted. |

**Indexes:** `aircraft_turnaround_flight_uq` (unique; `(flight_id) WHERE deleted_at IS NULL`); `aircraft_turnaround_latest_idx` (index; `(aircraft_id, arrived_at DESC) WHERE deleted_at IS NULL`).

**Cross-feature linkage:** `flight_id` → `flight(id)`; `airport_code` → `airport(iata_code)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-aircraft_turnaround_task"></a>

### `aircraft_turnaround_task`

Individual ground-service actions associated with a turnaround.

**Important behavior:** Each turnaround has at most one task of each type. `skipped` also counts as finished for readiness.

| Column          | SQL type      | Constraints / linkage                                                            | Meaning                                                                            |
| --------------- | ------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `id`            | `UUID`        | PK; required; default `gen_random_uuid()`                                        | Unique identifier for this record.                                                 |
| `turnaround_id` | `UUID`        | FK → `aircraft_turnaround(id)`; required                                         | Identifier of the related turnaround.                                              |
| `task_type`     | `TEXT`        | required; Allowed: refuel, cleaning, catering, inspection                        | Required turnaround action, such as refuelling or cleaning.                        |
| `status`        | `TEXT`        | required; default `'pending'`; Allowed: pending, in_progress, completed, skipped | Current lifecycle status.                                                          |
| `started_at`    | `TIMESTAMPTZ` | nullable                                                                         | Timestamp when started occurred (see simulation-time conventions if applicable).   |
| `completed_at`  | `TIMESTAMPTZ` | nullable                                                                         | Timestamp when completed occurred (see simulation-time conventions if applicable). |

**Table-level SQL constraints:** `UNIQUE (turnaround_id, task_type)`

<a id="table-fleet_setting"></a>

### `fleet_setting`

Fleet configuration key/value settings, including reserve ratio.

**Important behavior:** Schema inserts `reserve_ratio=1.10` (stored as text).

| Column       | SQL type      | Constraints / linkage                | Meaning                                               |
| ------------ | ------------- | ------------------------------------ | ----------------------------------------------------- |
| `key`        | `TEXT`        | PK; required; Allowed: reserve_ratio | Configuration key.                                    |
| `value`      | `TEXT`        | required                             | Setting or measured value.                            |
| `updated_at` | `TIMESTAMPTZ` | required; default `now()`            | Last modification timestamp (application-maintained). |
| `updated_by` | `UUID`        | FK → `staff(id)`; nullable           | Staff member who last changed this setting.           |

## F8 integration

F8 is committed. Crew fleet and certification types store `aircraft_type.model` (e.g. A320), shared across layout-specific codes such as A320-V2; they are TEXT without a SQL FK. Active-model validation requires the backend. Cabin staffing is specified as `ceil(layout seats / crew_setting.seats_per_cabin_crew)`, with an inserted default of 50 seats per cabin crew member. No dedicated cabin-crew-count column was added to F9. See [F8 dictionary](./f8-crew-management-and-rostering.md).

---

[← Database documentation home](../docs.md) · [Seed data](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
