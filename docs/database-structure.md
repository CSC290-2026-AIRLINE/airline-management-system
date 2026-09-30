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

The current scaffold contains these models:

- `user`
- `refresh_token`
- `customer`
- `staff`

Future feature models will be added to this same centralized schema.

## Migration workflow

Database migrations are managed by the Database Team.

Local development commands from the repository root:

```bash
npm run db:migrate
npm run db:migrate:deploy
npm run db:migrate:reset
```

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
5. After the change is merged, feature developers regenerate the Prisma client as needed.

The previously documented `db/schema-docs/<module>.md` workflow is **not present in the current repository**. The DB Leads can add that structure later if the team adopts it.

## Naming

Model/table names are not prefixed by module or team ID.

Use normal domain names such as:

```text
Reservation
SeatHold
RefundLedger
CrewPairing
```

The current scaffold uses lowercase Prisma model names (`user`, `customer`, etc.), so follow the conventions established by the DB Leads for new models rather than assuming every existing model demonstrates the final style.

## Rules

1. Only the Database Team modifies the centralized schema and creates migrations.
2. Existing migration files are append-only and should not be hand-edited, renamed, or deleted.
3. Cross-module foreign keys require coordination among the affected feature teams and DB Leads.
4. Avoid duplicate/shared "god models" unless the DB Leads approve the domain design.
5. Generated Prisma client code should not be manually edited.

## Code ownership note

`CODEOWNERS` now points database ownership at the actual `/apps/backend/src/db/` path used by this repository snapshot. If the database directory moves again, update both the documentation and `CODEOWNERS` together.
