# Cross-feature Relationships, Constraints & Migrations

> **Status: MERGED LEVEL 1 SCHEMA — verified against `dev` on 21 Oct 2026 (`752428e732da`).** [PR #14](https://github.com/CSC290-2026-AIRLINE/airline-management-system/pull/14) merged on 12 Oct 2026 (16:54 UTC). The F1/F2/F4/F7/F9/F12/F15 SQL dictionary describes the committed 69-table Level 1 schema; Feature 8 is documented separately as an **unmerged proposal**. Repository merge is not proof of deployment to any running database or final feature-owner approval.

## 3. Cross-feature relationships and scope

The merged Level 1 schema includes standard intra-feature FKs inside table definitions and a separate final **Part 8** of cross-feature foreign keys. The merged migration includes Part 8. The earlier design discussion called it optional; removing it is a **team decision**, not a documentation shortcut.

| Referencing feature | Referenced feature | Main link examples                                                                                               |
| ------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| F2                  | F9                 | `flight.aircraft_id` → `aircraft.id`; old/new aircraft in `flight_event`.                                        |
| F9                  | F2                 | `aircraft.base_airport_code` → `airport.iata_code`; `aircraft_turnaround` → `flight` / `airport`.                |
| F4                  | F2                 | Base fares → route; quotes → flight.                                                                             |
| F7                  | F2                 | `screening_check.flight_id` → `flight.id`.                                                                       |
| F12                 | F2, F9             | Menus, catering, warehouses, stock movements, sales, transfers and reports → flight, route, airport or aircraft. |

**Not declared as SQL FKs in this Level 1 schema:** F12 `product_order.booking_id` and `product_order.payment_id`, order-line `booking_passenger_id`, F7 `screening_check.pnr_id`, F12 `product_sale.payment_id`. These point into feature areas not included yet (F3b and/or F5). `fare_quote_line.source_id` is also polymorphic and not FK-constrained.

**Whether to enforce these relationships in the database or via cross-module APIs** must be agreed between affected feature owners and Database Leads. Where Part 8 is dropped, ID validation shifts to backend/API integrations.

### Planned Feature 8 links (not currently present)

The [Feature 8 Iteration-02 proposal](./f8-crew-management-and-rostering.md) introduces 10 **new, unmerged** tables. Its proposed keys include `crew.base_airport` and `pairing.base_airport`, which must target `airport.iata_code` (NOT `airport.code`), `pairing_leg.flight_id` to `flight.id`, and `rule_break.overridden_by` to `staff.id`.

A string fleet code / aircraft type code cannot safely assume `aircraft_type.code` is a stable unqualified FK target because the current uniqueness is a _partial_ index (`WHERE deleted_at IS NULL`); DB Leads should decide whether to reference `aircraft_type.id` instead. The `airport.country` TEXT values also need an agreed ISO country-code mapping for `country_language` and country-specific rules. **Do not incorporate the proposed F8 tables into the 69-table current count or run their draft SQL without DB approval.**

## 4. SQL features Prisma does not fully capture

### Migration history and data-loss warning

| Migration                                                                    | What it does                                                                                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260928160443/migration.sql`                                               | Original scaffold used plural `users`, `refresh_tokens`, `passengers` alongside `staff`.                                                                  |
| `20260928162047/migration.sql`                                               | Drops earlier plural tables; creates singular `user`, `refresh_token`, `customer` and reconnects `staff`.                                                 |
| `20261012150000_level1_schema/migration.sql` (**merged on `dev` by PR #14**) | Drops the four scaffold tables `refresh_token`, `customer`, `staff`, `user` with `CASCADE`, then applies the Level 1 schema and inserts the `admin` role. |

> **Database safety:** The new Level 1 migration is **destructive to existing scaffold records**. The PR discussion tested on a fresh database; it is **not a data-preserving upgrade plan** for a populated environment. Do not run migration reset/apply against a shared or production DB containing data without a backup and a DB-lead-approved migration strategy. Existing migrations are append-only by team policy.

The merged Level 1 schema is **not** equivalent to a plain Prisma schema. When reviewing or re-generating migrations, preserve:

- **Exclusion constraints** (GiST): aircraft scheduled flight overlaps (`flight`) and aircraft status periods (`aircraft_status_period`); extension `btree_gist`.
- **Trigram search indexes:** normalized watchlist matching, using `pg_trgm` and `name_key()`.
- **Expression / partial unique indexes:** e.g. case-insensitive `(type, lower(email))` on non-deleted users, one open scheduling conflict, one active meal per passenger per flight, and soft-delete-aware uniqueness.
- **Check constraints and composite foreign keys:** defined explicitly in SQL, including combinations of columns and state integrity.
- **Triggers:** `forbid_mutation()` protects `flight_event` from UPDATE/DELETE and `audit_log` / `stock_movement` from UPDATE/DELETE/TRUNCATE. A separate trigger forbids editing an `aircraft_type.layout`.
- **Manual Prisma relation adjustment:** after `prisma db pull`, the checked-in `schema.prisma` header says `user.customer`, `user.staff`, and `fare_quote.promo_redemption` need list back-relations to pass `prisma validate`. This is a known generator limitation, **not permission to alter the SQL cardinality**.

---

[← Database documentation home](../docs.md) · [Seed data](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
