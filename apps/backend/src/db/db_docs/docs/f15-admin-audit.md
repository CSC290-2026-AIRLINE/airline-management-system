# F15 — Administration and audit

> **Status: COMMITTED SCHEMA — verified 24 Oct 2026 against `dev` commit `a97740c646b2a6e82448243db4817a7a5822e14b`.** The current SQL and Prisma schema contain **84 tables / 758 columns**, including F2 Iteration-03 and F8 crew/rostering. Committed migrations do not prove deployment or completed application behavior.

**Tables (3):** [`screen`](#table-screen) · [`role_screen`](#table-role_screen) · [`audit_log`](#table-audit_log)

<a id="table-screen"></a>

### `screen`

Admin-managed catalogue of application screens and their access category.

**Important behavior:** `core` and `admin` screen access is implicit; only `assignable` screens appear in `role_screen`.

| Column       | SQL type      | Constraints / linkage                                              | Meaning                                               |
| ------------ | ------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| `id`         | `UUID`        | PK; required; default `gen_random_uuid()`                          | Unique identifier for this record.                    |
| `feature_no` | `TEXT`        | required                                                           | Feature identifier such as 6, 13, or 3b.              |
| `code`       | `TEXT`        | required; unique                                                   | 'f6.gate_screen'.                                     |
| `name`       | `TEXT`        | required                                                           | Human-readable name.                                  |
| `kind`       | `TEXT`        | required; default `'assignable'`; Allowed: core, admin, assignable | Access model: core, admin, or assignable.             |
| `is_active`  | `BOOLEAN`     | required; default `true`                                           | Whether the record is enabled for new use.            |
| `created_at` | `TIMESTAMPTZ` | required; default `now()`                                          | Actual database creation timestamp.                   |
| `updated_at` | `TIMESTAMPTZ` | required; default `now()`                                          | Last modification timestamp (application-maintained). |

**Table-level SQL constraints:** `UNIQUE (id, kind)`

<a id="table-role_screen"></a>

### `role_screen`

Many-to-many permission assignments for assignable screens and roles.

**Important behavior:** Composite PK prevents duplicate assignments; composite FK ensures screen kind is `assignable`.

| Column        | SQL type | Constraints / linkage                                                        | Meaning                                              |
| ------------- | -------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `role_id`     | `UUID`   | PK; FK → `role(id)`; required                                                | Related staff role identifier.                       |
| `screen_id`   | `UUID`   | PK; FK → `screen(id, kind) (composite)`; required                            | Identifier of the related screen.                    |
| `screen_kind` | `TEXT`   | FK → `screen(id, kind) (composite)`; required; default `'assignable'`; CHECK | Fixed assignable value required by the composite FK. |

**Table-level SQL constraints:** `PRIMARY KEY (role_id, screen_id)` · `FOREIGN KEY (screen_id, screen_kind) REFERENCES screen (id, kind)`

**Indexes:** `role_screen_screen_idx` (index; `(screen_id)`).

<a id="table-audit_log"></a>

### `audit_log`

Append-only record of actions, actors, changed entities, and masked before/after data.

**Important behavior:** Immutable via SQL triggers on UPDATE/DELETE/TRUNCATE. `occurred_at` follows simulated time, `recorded_at` real time, and `seq` sequence-allocation order, not transaction commit order. Sensitive-field masking is required in the future audit writer; none is implemented here.

| Column           | SQL type      | Constraints / linkage                                                                                                                                          | Meaning                                                                     |
| ---------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `id`             | `UUID`        | PK; required; default `gen_random_uuid()`                                                                                                                      | Unique identifier for this record.                                          |
| `seq`            | `BIGINT`      | required; unique; GENERATED ALWAYS AS IDENTITY (omit on insert)                                                                                                | Generated sequence; gaps and out-of-order transaction commits are possible. |
| `occurred_at`    | `TIMESTAMPTZ` | required                                                                                                                                                       | Simulated time the event occurred.                                          |
| `recorded_at`    | `TIMESTAMPTZ` | required; default `now()`                                                                                                                                      | Actual database timestamp when audit row was recorded.                      |
| `actor_type`     | `TEXT`        | required; Allowed: staff, customer, system                                                                                                                     | Kind of actor: staff/customer/system.                                       |
| `actor_id`       | `UUID`        | nullable                                                                                                                                                       | User ID of actor; NULL for system action.                                   |
| `actor_role`     | `TEXT`        | nullable                                                                                                                                                       | Actor’s role code at event time.                                            |
| `source_feature` | `TEXT`        | required                                                                                                                                                       | Feature that emitted the audit entry.                                       |
| `action`         | `TEXT`        | required; Allowed: sign_in, sign_out, sign_in_blocked, access_denied, create, update, delete, view_sensitive, role_change, status_change, screen_access_change | Audited action performed by an actor or by the system.                      |
| `entity_type`    | `TEXT`        | nullable                                                                                                                                                       | Type of object affected by the audited action.                              |
| `entity_id`      | `TEXT`        | nullable                                                                                                                                                       | TEXT because ids differ across features.                                    |
| `summary`        | `TEXT`        | nullable                                                                                                                                                       | Human-readable overview of the audited change.                              |
| `reason`         | `TEXT`        | nullable                                                                                                                                                       | Human-readable cause or explanation.                                        |
| `before`         | `JSONB`       | nullable                                                                                                                                                       | Masked JSON state before change.                                            |
| `after`          | `JSONB`       | nullable                                                                                                                                                       | Masked JSON state after change.                                             |
| `is_sensitive`   | `BOOLEAN`     | required; default `false`                                                                                                                                      | Before/after are masked by the writer; list views hide them.                |

**Indexes:** `audit_log_occurred_idx` (index; `(occurred_at DESC)`); `audit_log_feature_idx` (index; `(source_feature, occurred_at DESC)`); `audit_log_actor_idx` (index; `(actor_type, actor_id, occurred_at DESC)`); `audit_log_entity_idx` (index; `(entity_type, entity_id, occurred_at DESC)`).

## F8 audit integration contract

F8 requires every staff write, publish action and company-rule override to be sent to `audit_log` (append-only). **Actual F15 columns and allowed actions govern the write**: `actor_id` corresponds to `user.id` per SQL comments, while F8’s `rule_break.overridden_by` references `staff.id`; write a supported action such as `create`, `update` or `status_change` with `source_feature = '8'`. F8 tables and override constraints are committed, but no F8 audit writer is implemented. See [F8 dictionary](./f8-crew-management-and-rostering.md).

---

[← Database documentation home](../docs.md) · [Seed data](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
