# Airline Management System — Database Documentation

> **Status: MERGED LEVEL 1 SCHEMA — verified against `dev` on 21 Oct 2026 (`752428e732da`).** [PR #14](https://github.com/CSC290-2026-AIRLINE/airline-management-system/pull/14) merged on 12 Oct 2026 (16:54 UTC). The F1/F2/F4/F7/F9/F12/F15 SQL dictionary describes the committed 69-table Level 1 schema; Feature 8 is documented separately as an **unmerged proposal**. Repository merge is not proof of deployment to any running database or final feature-owner approval.

**Maintained by:** Database Team — Docs + Maintain  
**Scope:** Current Level 1 SQL on `dev`: F1 baseline and Features 2, 4, 7, 9, 12, 15 — **69 implemented tables / 640 columns**. Plus a **separate proposed Feature 8** dictionary based on the 11 Oct 2026 Iteration-02 specification; its **10 proposed tables are not in `dev`**. The 69-table total deliberately excludes Feature 8.

## Find the documentation you need

The detailed data dictionary is split by feature, so developers only need to open the section they are working on.

| Feature               | What it covers                                                                                             | Data dictionary                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **F1**                | Shared users, staff, roles, refresh tokens (4 tables)                                                      | [F1 — Baseline](./docs/f1-baseline.md)                                             |
| **F2**                | Airports, routes, flights, scheduling, disruptions (12 tables)                                             | [F2 — Flight Scheduling](./docs/f2-flight-scheduling.md)                           |
| **F4**                | Fare classes, pricing, quotes, promotions, expenses, finance (15 tables)                                   | [F4 — Pricing & Finance](./docs/f4-pricing-finance.md)                             |
| **F7**                | Passenger identities, customer accounts, watchlists and screening (6 tables)                               | [F7 — Profiles & Screening](./docs/f7-profiles-screening.md)                       |
| **F8 (proposed)**     | Crew management, pairing construction, legality and roster publishing (**10 proposed tables**, NOT merged) | [F8 — Crew & Rostering (Iteration-02)](./docs/f8-crew-management-and-rostering.md) |
| **F9**                | Aircraft, maintenance, operating days and turnaround tasks (8 tables)                                      | [F9 — Aircraft](./docs/f9-aircraft-management.md)                                  |
| **F12**               | Products, menus, passenger orders (7 tables)                                                               | [F12A — Catalogue & Orders](./docs/f12-catalog-and-orders.md)                      |
| **F12**               | Warehouses, catering, inventory, stock transfers, sales (14 tables)                                        | [F12B — Inventory & Catering](./docs/f12-inventory-and-catering.md)                |
| **F15**               | Screen access, role permissions and audit history (3 tables)                                               | [F15 — Admin & Audit](./docs/f15-admin-audit.md)                                   |
| **Implemented total** | **69 tables, 640 columns**, excluding the 10 unmerged F8 proposals                                         |                                                                                    |

## Shared reference guides

| Guide                                                                | What you will find                                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Relationships & Migrations](./docs/relationships-and-migrations.md) | Cross-feature foreign keys, Prisma limits, SQL-only rules, migration history and data-loss warning       |
| [Seeds](./docs/seed-data.md)                                         | Actual inserted defaults, test data, bootstrap rows, missing required seeds and a verification checklist |
| [Decisions & Maintenance](./docs/decisions-and-maintenance.md)       | Naming and data standards, unconfirmed design decisions, changelog and how to keep these files updated   |

## Authoritative repository files

| File                                                                                                                                                                                                                                                            | Purpose                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`schema.sql`](https://github.com/CSC290-2026-AIRLINE/airline-management-system/blob/dev/apps/backend/src/db/schema.sql)                                                                                                                                        | Merged Level 1 SQL: table definitions, constraints, indexes, triggers, inline inserts                      |
| [`prisma/schema.prisma`](https://github.com/CSC290-2026-AIRLINE/airline-management-system/blob/dev/apps/backend/src/db/prisma/schema.prisma)                                                                                                                    | Merged Prisma ORM models; does **not** represent all PostgreSQL-only rules                                 |
| [`prisma/migrations/20261012150000_level1_schema/migration.sql`](https://github.com/CSC290-2026-AIRLINE/airline-management-system/blob/dev/apps/backend/src/db/prisma/migrations/20261012150000_level1_schema/migration.sql)                                    | **Merged** Level 1 migration on `dev`; includes `schema.sql` unchanged, plus scaffold drops and admin role |
| [`seed.ts`](https://github.com/CSC290-2026-AIRLINE/airline-management-system/blob/dev/apps/backend/src/db/seed.ts)                                                                                                                                              | Generated development/test records, not the full agreed reference seeds                                    |
| [`db.module.ts`](https://github.com/CSC290-2026-AIRLINE/airline-management-system/blob/dev/apps/backend/src/db/db.module.ts) and [`db.service.ts`](https://github.com/CSC290-2026-AIRLINE/airline-management-system/blob/dev/apps/backend/src/db/db.service.ts) | NestJS database module and Prisma connection lifecycle                                                     |
| [Central DB workflow](https://github.com/CSC290-2026-AIRLINE/airline-management-system/blob/dev/docs/database-structure.md)                                                                                                                                     | Ownership, update procedure and team rules (**scaffold model-count section is outdated on `dev`**)         |
| [Git workflow](https://github.com/CSC290-2026-AIRLINE/airline-management-system/blob/dev/docs/branch-naming-and-workflow.md)                                                                                                                                    | Branch naming and PR requirements                                                                          |

**Technology:** PostgreSQL 16 (Docker Compose), Prisma with `@prisma/adapter-pg`, NestJS. `DATABASE_URL` is configured in `apps/backend/prisma.config.ts` and the backend configuration; do not store credentials in documentation.

## How to read the data dictionary

- **PK** = primary key; **FK** = SQL-enforced foreign key; **cross-FK** = cross-feature FK from Part 8 of `schema.sql` (included in the merged migration, but originally optional in the proposal).
- **required** = `NOT NULL` / PK. **nullable** = NULL allowed by SQL, although backend validation may require a value for some operations.
- **unique** may mean a single-column constraint or a compound/partial unique index; read each table’s **Indexes** note.
- **`created_at` / `updated_at`** normally use database wall-clock time; named business events may require the _simulated clock_, which the backend supplies.
- **Soft-deleted** rows are typically indicated by `deleted_at`; partial indexes may only apply to non-deleted rows.
- **Defined in SQL ≠ applied to an environment.** **Backend rule ≠ database constraint.** **Seeded in code ≠ verified in a deployed database.**

## Important notes before integration

1. The Level 1 SQL being documented is **merged into `dev`** by PR #14 (12 Oct 2026). **Merge is not proof that migrations ran** on a particular development or production database. **F8 is proposal only**, not part of that merge.
2. The merged Level 1 migration **drops existing scaffold tables** before recreating them. Treat it as destructive to their data; do not apply it to a populated database without an approved preservation plan.
3. The first `admin` role is inserted by the migration, but the complete reference seed (screens, base currency, airline code, initial admin account and more) is still missing as a complete reference seed on the inspected `dev` branch.
4. Some decisions remain open with feature owners (F1 baseline, F4 cash-basis/refund semantics, F9 layout versioning, F12 provisional menu defaults and cross-feature FK assumptions). Track them in [Decisions & Maintenance](./docs/decisions-and-maintenance.md).
5. Never edit generated Prisma client files or existing migrations solely to make the documentation match; escalate mismatches to DB Leads.

## Updating these documents

After a database PR merges: check `schema.sql` **and the applied migration**, review Prisma and seed changes, update only the affected feature files plus shared references, record the commit/PR, and submit a docs PR using the team’s workflow. See [Decisions & Maintenance](./docs/decisions-and-maintenance.md).

**Read-only deliverable:** This updated ZIP does not modify GitHub or the database. It is a documentation proposal ready for team review and a separate docs PR.

**Snapshot:** inspected `dev` HEAD `752428e732da4e4179a5c4f7ea2c1a07bc3f6400` (21 Oct 2026); F8 source: Group 1 Iteration-02 specification dated 11 Oct 2026. See [Verification & update notes](./REVIEW_NOTES_2026-10-21.md).
