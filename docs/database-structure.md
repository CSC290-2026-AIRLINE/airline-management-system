# Database Structure

The database layer is centrally designed, modeled, and maintained by the Database Leads/Team.

Feature teams specify domain requirements; the DB Team translates those requirements into normalized tables, relations, constraints, indexes, and managed migrations.

## Current source of truth

The current Prisma database layer is inside the backend application:

```text
apps/backend/src/db/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── schema.sql
├── seed.ts
├── db.module.ts
└── db.service.ts
```

There is **no root-level `/db` directory in the current repository**.

## Current schema

`apps/backend/src/db/prisma/schema.prisma` is the centralized Prisma schema for the project.

At `dev` commit `46a7f55be46a2237545869cbec356cd61e5a31d6`, the SQL and Prisma inventories contain **84 tables / 772 columns**:

| Feature | Coverage | Tables |
| --- | --- | --- |
| F1 | Identity, roles and sessions | 4 |
| F2 | Flight scheduling, network and schedule approvals | 16 |
| F4 | Pricing and finance | 15 |
| F7 | Customer/passenger profiles, watchlists and screening | 6 |
| F8 | Crew management and rostering | 11 |
| F9 | Aircraft management | 8 |
| F12 | Product catalogue, orders, inventory and catering | 21 |
| F15 | Administration, permissions and audit | 3 |

See the [database documentation index](../apps/backend/src/db/db_docs/docs.md) for table dictionaries and relationships.
`schema.sql` consolidates the current SQL definitions, including constraints and indexes that Prisma cannot fully represent.
Committed schema definitions do not establish completed application features or prove that a running database has been migrated.

## Migration workflow

Database migrations are managed by the Database Team.

Local development commands from the repository root:

```bash
npm run db:migrate
npm run db:migrate:deploy
npm run db:generate
```

`db:migrate` creates/applies development migrations; `db:migrate:deploy` applies committed migrations; `db:generate` refreshes the Prisma client.
Only use `npm run db:migrate:reset` for an intentionally disposable local database: it deletes data and requires explicit approval.

The Level 1 baseline is followed by migrations for F2 schedule approvals, F8 crew rostering and F7 screening Iteration-03.
Apply committed migrations in order rather than running consolidated `schema.sql` over an existing database.
The F7 migration removes `screening_check.flight_dep_at`, adds identity snapshots, and replaces one review per check with revisioned reviews.
See [migration history and data preservation](../apps/backend/src/db/db_docs/docs/relationships-and-migrations.md#migration-history) before upgrading.

The Prisma configuration in `apps/backend/prisma.config.ts` points Prisma to:

```text
apps/backend/src/db/prisma/schema.prisma
```

### Feature-team request process

Feature teams should not independently generate competing schema changes.

Instead:

1. Define the data requirements for the feature.
2. Coordinate cross-module relationships with the affected teams.
3. Submit the requested model/field/relation changes to the Database Team.
4. The DB Team updates the centralized Prisma schema and creates the migration.
5. After the change is merged, feature developers pull and run `npm run db:generate` to regenerate the Prisma client.

Maintain feature dictionaries under `apps/backend/src/db/db_docs/docs/` and keep the documentation index, shared counts and migration overview aligned with schema changes.

## Naming

Model/table names are not prefixed by module or team ID.

Use normal domain names such as:

```text
schedule_approval
screening_check
pairing_leg_assignment
```

The current schema uses singular lowercase `snake_case` for model/table and column names. Follow the conventions established by the DB Leads for new models.

## Rules

1. Only the Database Team modifies the centralized schema and creates migrations.
2. Existing migration files are append-only and should not be hand-edited, renamed, or deleted.
3. Cross-module foreign keys require coordination among the affected feature teams and DB Leads.
4. Avoid duplicate/shared "god models" unless the DB Leads approve the domain design.
5. Generated Prisma client code should not be manually edited.

## Code ownership note

`CODEOWNERS` includes `/apps/backend/src/db/` for Database Leads, but the later `/apps/backend/` rule takes precedence and assigns Development Leads to that path. Infrastructure Leads still need to correct the rule order. If the database directory moves, update both the documentation and `CODEOWNERS` together.
