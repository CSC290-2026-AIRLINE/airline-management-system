# Airline Management System — Database Documentation

> **Status: COMMITTED SCHEMA.** Repository source reviewed; running-database deployment and completed feature behavior require separate verification.

**Maintained by:** Database Team — Docs + Maintain.

**Scope:** F1, F2, F4, F7, F8, F9, F12 and F15. The original Level 1 baseline had 69 tables / 640 columns; F2 Iteration-03 adds four tables / 42 columns, F8 adds eleven tables / 76 columns and the F7 screening update adds 14 columns net. Current total: **84 tables / 772 columns**.

## Current schema snapshot

**Verified:** 28 Oct 2026 against `dev` commit `46a7f55be46a2237545869cbec356cd61e5a31d6`.

**Inventory:** 84 SQL tables / 772 columns, 84 Prisma models and 98 explicitly named indexes.

**Latest migration:** `20261025120000_feature7_screening_iteration_03`.

F7 Iteration-03 adds watchlist gender, screening identity snapshots and name similarity, repeatable `entry_change` checks, and revisioned screening reviews. Screening queues now read departure time from F2 `flight`; the copied `flight_dep_at` column and its old queue index were removed. [Current verification notes](./REVIEW_NOTES_2026-10-28.md).

## Data dictionaries

| Feature   | Coverage                                                         | Tables | Guide                                                          |
| --------- | ---------------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| F1        | Roles, users, staff and refresh tokens                           | 4      | [Baseline](./docs/f1-baseline.md)                              |
| F2        | Network, flights, disruptions, partners and schedule approvals   | 16     | [Flight scheduling](./docs/f2-flight-scheduling.md)            |
| F4        | Fares, pricing, quotes, promotions and finance                   | 15     | [Pricing & finance](./docs/f4-pricing-finance.md)              |
| F7        | Passengers, customers, watchlists and screening                  | 6      | [Profiles & screening](./docs/f7-profiles-screening.md)        |
| F8        | Crew, country rules, pairings, roster runs and violations        | 11     | [Crew & rostering](./docs/f8-crew-management-and-rostering.md) |
| F9        | Aircraft, availability, maintenance and turnaround               | 8      | [Aircraft](./docs/f9-aircraft-management.md)                   |
| F12       | Products, menus and passenger orders                             | 7      | [Catalogue & orders](./docs/f12-catalog-and-orders.md)         |
| F12       | Warehouses, batches, catering, transfers, sales and stock ledger | 14     | [Inventory & catering](./docs/f12-inventory-and-catering.md)   |
| F15       | Screens, role permissions and audit history                      | 3      | [Administration & audit](./docs/f15-admin-audit.md)            |
| **Total** |                                                                  | **84** |                                                                |

## Shared guides

- [Relationships & migrations](./docs/relationships-and-migrations.md): cross-feature FKs, SQL-only constraints and migration history.
- [Seed data](./docs/seed-data.md): migration defaults, development network and missing reference data.
- [Decisions & maintenance](./docs/decisions-and-maintenance.md): conventions, remaining decisions and update workflow.
- [Verification notes, 28 Oct](./REVIEW_NOTES_2026-10-28.md): current schema comparison and merge resolution.
- [Historical verification, 24 Oct](./REVIEW_NOTES_2026-10-24.md): F2/F8 snapshot before the F7 update.
- [Historical verification, 21 Oct](./REVIEW_NOTES_2026-10-21.md): previous baseline snapshot, superseded for current counts and F8 status.

## Repository sources

All paths below are relative to `apps/backend/src/db/`.

| File                                                                   | Purpose                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`schema.sql`](../schema.sql)                                          | Consolidated current DDL, indexes, CHECKs, triggers and embedded inserts |
| [`prisma/schema.prisma`](../prisma/schema.prisma)                      | ORM models; SQL remains necessary for rules Prisma cannot represent      |
| [`prisma/migrations/`](../prisma/migrations/)                          | Ordered history: scaffold, Level 1, F2 approvals, F8 and F7 screening    |
| [`seed.ts`](../seed.ts)                                                | Roles, F2 demo network and generated identity/session test records       |
| [`db.module.ts`](../db.module.ts), [`db.service.ts`](../db.service.ts) | NestJS database injection and connection lifecycle                       |
| [Central database guide](../../../../../docs/database-structure.md)    | Ownership/workflow; its four-model scaffold section remains outdated     |

**Actual repository technology:** PostgreSQL 16, Prisma 7 with `@prisma/adapter-pg`, and NestJS. This documents the existing repository. No stack changes are part of this documentation update. Configuration comes from `apps/backend/prisma.config.ts` and backend configuration; do not copy credentials into docs.

## Reading and integration notes

- PK = primary key; FK = SQL-enforced foreign key; cross-FK = a cross-feature FK in current `schema.sql` Part 9. The original Level 1 migration used Part 8 for that section.
- Required means SQL NOT NULL, primary key or generated identity; nullable means SQL permits NULL, possibly subject to conditional CHECKs.
- Uniqueness can be compound, partial, expression-based or `NULLS NOT DISTINCT`; read each index definition.
- `created_at` / `updated_at` use real time; business timestamps generally require the application simulation clock. Defaults do not automatically refresh updated_at.
- Committed tables do not establish implemented feature services. The backend currently registers auth and app infrastructure; F2/F7/F8 services and workers, legality calculations, publication gates and audit writers still require implementation.
- The original Level 1 migration drops scaffold data. Existing migrations are append-only; do not reset a populated/shared database to make docs match.
- `schema.sql` is now a consolidated schema, not a byte-for-byte copy of the original Level 1 migration. Apply subsequent F2/F8/F7 migrations in order to upgrade the baseline.
- Screen definitions, base currency, airline code and a complete approved bootstrap seed remain missing. F8 settings exist, but crew/country-language demo data does not.
- Repository source was inspected; no running database deployment or runtime constraints were verified.

Documentation maintenance is limited to this folder. Schema and migration files brought in from dev are upstream changes, not documentation edits.
