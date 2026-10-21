# Seed Data and Bootstrap Status

> **Status: MERGED LEVEL 1 SCHEMA — verified against `dev` on 21 Oct 2026 (`752428e732da`).** [PR #14](https://github.com/CSC290-2026-AIRLINE/airline-management-system/pull/14) merged on 12 Oct 2026 (16:54 UTC). The F1/F2/F4/F7/F9/F12/F15 SQL dictionary describes the committed 69-table Level 1 schema; Feature 8 is documented separately as an **unmerged proposal**. Repository merge is not proof of deployment to any running database or final feature-owner approval.

## 5. Seed data — what exists and what is missing

**A seed is an insertion of initial or test rows, not a table definition.** The following describes what the inspected `dev` branch contains, not what has already executed in your teammate’s machine or staging database.

### 5.1 Statements embedded in `schema.sql`

| Target table       | Defined inserted values                                      | Notes                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flight_setting`   | `holding_limit_minutes = 30`                                 | Actual SQL insert; separate `airline_code` is still required.                                                                                                                                       |
| `fleet_setting`    | `reserve_ratio = 1.10`                                       | Actual SQL insert, string value.                                                                                                                                                                    |
| `cabin_setting`    | Four network rows: economy, premium economy, business, first | Marked **placeholder / confirm with F12 owner**. Economy and premium economy are paid with zero included meals; business/first complimentary with one included meal; all show 48-hour order window. |
| `catering_setting` | `payment_hold_minutes = 30`                                  | Actual SQL insert.                                                                                                                                                                                  |

### 5.2 Migration-only bootstrap row

| Target | Insertion                             | Notes                                                                                                                                                |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role` | `admin` / `Admin` / `is_admin = true` | Inserted by the **merged Level 1 migration** after the copied schema via `ON CONFLICT (code) DO NOTHING`. Needed so staff sign-in can find its role. |

### 5.3 `seed.ts`: Faker-generated development records

| Target table    | Per execution on a fresh DB | Meaning / caveat                                                                                         |
| --------------- | --------------------------: | -------------------------------------------------------------------------------------------------------- |
| `role`          |       4 role codes (upsert) | `check-in`, `gate`, `baggage`, `admin` (admin has `is_admin=true`). Already-existing rows are preserved. |
| `user`          |                  5 new rows | 3 customer-type users + 2 staff-type users.                                                              |
| `passenger`     |                  3 new rows | One for each generated customer user.                                                                    |
| `customer`      |                  3 new rows | Each links a user and their passenger.                                                                   |
| `staff`         |                  2 new rows | Each links to a generated staff-type user and picks a role at random.                                    |
| `refresh_token` |                 10 new rows | Two generated token hashes for each of the five created users.                                           |

**Repeatability:** `role` uses `upsert` to avoid duplicate role codes. The random user/profile/token rows are created anew per execution; **do not describe the whole seed as fully idempotent**. Exact generated names, nationality, birthdays, and hashes vary each run; no fixed values should be documented as if guaranteed.

### 5.4 Required seeds that are not in this PR

The current branch header explicitly says that rows beyond the migration admin role—particularly **screen definitions, `pricing_setting.base_currency`, `flight_setting.airline_code`, and the first real admin account**—are not yet included as a complete `level1-seed.sql` in inspected `dev`. Other feature-specific reference rows may also be needed, pending owner agreement. Do **not** claim that these are deployed or that the example airline code `FL` is the confirmed company code.

### 5.5 Seed verification checklist

- [ ] Full agreed reference seed file is committed and referenced here.
- [ ] Role codes / permissions, screen catalogue, base currency, airline code and initial admin account are confirmed with owners.
- [ ] All inserted tables, rows/keys, intended environment and responsible owner are documented.
- [ ] Seed ordering respects FK dependencies; actual execution on a clean database is verified by the Database Team.
- [ ] Real credentials, raw session tokens, passwords, and personally identifiable test data are not copied into documentation.

### 5.6 Feature 8 reference data (proposed — not seeded)

No Feature 8 tables or seeds are currently present in the merged Level 1 schema. When the F8 migration is approved, the database team must agree and seed:

- Exactly one default `legality_rule`, plus approved country-specific overrides (initially use project defaults for all countries, per Iteration-02). A nullable unique `country_code` by itself does **not** ensure a single default row in PostgreSQL.
- `country_language` codes using an agreed ISO-3166-1-alpha-2 country-code mapping and ISO-639-1 language codes. `airport.country` currently stores unnormalized TEXT, so normalize/transform before lookups.
- F9 fleet type references, cabin-crew count by aircraft type, and representative crew/ratings **only in demo/test environments**. No fabricated production crew identity or licence records.
- Police seat allocation depends on F3 booking/seat inventory; no confirmed F3 seed interface yet.

See [F8 — Crew & Rostering](./f8-crew-management-and-rostering.md).

---

[← Database documentation home](../docs.md) · [Seed data](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
