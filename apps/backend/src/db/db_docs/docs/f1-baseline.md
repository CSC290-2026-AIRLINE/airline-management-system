# F1 — Shared identity and authentication baseline

> **Status: COMMITTED SCHEMA — inventory checked 27 Oct 2026 against `dev` commit `46a7f55be46a2237545869cbec356cd61e5a31d6`.** The SQL and Prisma table/column inventories match: **84 tables / 772 columns**, including F2 approvals, F8 crew/rostering and F7 screening Iteration-03. Committed migrations do not prove deployment or completed application behavior.

**Tables (4):** [`role`](#table-role) · [`user`](#table-user) · [`staff`](#table-staff) · [`refresh_token`](#table-refresh_token)

**Status:** F1 baseline is included as a shared dependency; Freddie’s schema explicitly asks the Feature 1 owner to confirm or replace this baseline.

<a id="table-role"></a>

### `role`

Staff role catalogue, including admin classification used by authorization rules.

**Important behavior:** The `is_admin` flag drives F15 administrative privileges. The last-admin protection rule is a backend requirement; no implementation is present in this checkout.

| Column       | SQL type      | Constraints / linkage                     | Meaning                                               |
| ------------ | ------------- | ----------------------------------------- | ----------------------------------------------------- |
| `id`         | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                    |
| `code`       | `TEXT`        | required; unique                          | Stable short code for this record.                    |
| `name`       | `TEXT`        | required                                  | Human-readable name.                                  |
| `is_admin`   | `BOOLEAN`     | required; default `false`                 | Flag indicating whether admin applies.                |
| `created_at` | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp.                   |
| `updated_at` | `TIMESTAMPTZ` | required; default `now()`                 | Last modification timestamp (application-maintained). |

<a id="table-user"></a>

### `user`

Shared identity for customer and staff sign-in, Clerk linkage, and account status.

**Important behavior:** Active accounts use `disabled_at IS NULL` and `deleted_at IS NULL`. Email uniqueness is **per user type**, case-insensitive, for undeleted rows (not global). Staff and customer Clerk apps are separate.

| Column          | SQL type      | Constraints / linkage                     | Meaning                                                                  |
| --------------- | ------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| `id`            | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                                       |
| `type`          | `TEXT`        | required; Allowed: customer, staff        | Account kind: customer or staff.                                         |
| `email`         | `TEXT`        | required                                  | Email address used for contact or sign-in.                               |
| `clerk_user_id` | `TEXT`        | nullable; unique                          | External Clerk identity identifier; may be absent for pre-created staff. |
| `disabled_at`   | `TIMESTAMPTZ` | nullable                                  | Simulation-time account deactivation; NULL means not disabled.           |
| `created_at`    | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp.                                      |
| `updated_at`    | `TIMESTAMPTZ` | required; default `now()`                 | Last modification timestamp (application-maintained).                    |
| `deleted_at`    | `TIMESTAMPTZ` | nullable                                  | Soft-delete timestamp; NULL means current account.                       |

**Table-level SQL constraints:** `UNIQUE (id, type)`

**Indexes:** `user_type_email_uq` (unique; `(type, lower(email)) WHERE deleted_at IS NULL`).

<a id="table-staff"></a>

### `staff`

Staff profile linked to a staff-type user and assigned role.

**Important behavior:** `user_type = staff` is enforced through the composite FK. `staff_code` uses a database sequence such as `ST-0001`.

| Column            | SQL type      | Constraints / linkage                                                 | Meaning                                                    |
| ----------------- | ------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `id`              | `UUID`        | PK; required; default `gen_random_uuid()`                             | Unique identifier for this record.                         |
| `user_id`         | `UUID`        | FK → `user(id, type) (composite)`; required                           | Related shared login user identifier.                      |
| `user_type`       | `TEXT`        | FK → `user(id, type) (composite)`; required; default `'staff'`; CHECK | Fixed to staff, enforcing staff-only identity link.        |
| `first_name`      | `TEXT`        | required                                                              | First name.                                                |
| `last_name`       | `TEXT`        | required                                                              | Family or last name.                                       |
| `role_id`         | `UUID`        | FK → `role(id)`; required                                             | Related staff role identifier.                             |
| `staff_code`      | `TEXT`        | required; unique; default `sequence-generated ST-xxxx`                | Sequence-generated public identifier for the staff member. |
| `last_sign_in_at` | `TIMESTAMPTZ` | nullable                                                              | Simulation timestamp of the most recent staff login.       |
| `created_at`      | `TIMESTAMPTZ` | required; default `now()`                                             | Actual database creation timestamp.                        |
| `updated_at`      | `TIMESTAMPTZ` | required; default `now()`                                             | Last modification timestamp (application-maintained).      |
| `deleted_at`      | `TIMESTAMPTZ` | nullable                                                              | Soft-delete timestamp; NULL means not deleted.             |

**Table-level SQL constraints:** `FOREIGN KEY (user_id, user_type) REFERENCES "user" (id, type)` · `UNIQUE (user_id)`

**Indexes:** `staff_role_idx` (index; `(role_id)`).

<a id="table-refresh_token"></a>

### `refresh_token`

Hashed refresh-token records for session rotation, expiry, and revocation.

**Important behavior:** Only the token hash is stored. `replaced_by` is not declared as a foreign key. Authentication rotates/revokes tokens in code.

| Column        | SQL type      | Constraints / linkage                     | Meaning                                                                |
| ------------- | ------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| `id`          | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                                     |
| `user_id`     | `UUID`        | FK → `user(id)`; required                 | Related shared login user identifier.                                  |
| `token_hash`  | `TEXT`        | required; unique                          | Unique SHA-256 digest of the refresh token, not the raw token.         |
| `expires_at`  | `TIMESTAMPTZ` | required                                  | Expiry time for this refresh token.                                    |
| `revoked_at`  | `TIMESTAMPTZ` | nullable                                  | Time this token was revoked.                                           |
| `replaced_by` | `UUID`        | nullable                                  | ID recorded for the next refresh token after rotation; no FK declared. |
| `created_at`  | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp.                                    |

**Indexes:** `refresh_token_user_idx` (index; `(user_id)`).

---

[← Database documentation home](../docs.md) · [Seed data](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
