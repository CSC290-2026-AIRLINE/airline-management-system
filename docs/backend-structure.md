# Backend Structure

The backend is a single **NestJS monolith** under `apps/backend`. Feature teams will eventually own one module folder each under `src/modules/`.

Prisma is the ORM. The database schema is centralized and currently lives at:

```text
apps/backend/src/db/prisma/schema.prisma
```

Feature modules do not own separate Prisma schemas or database clients.

## Current repository structure

```text
apps/backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── app.service.ts
│   ├── auth/                       # existing authentication implementation
│   │   ├── auth.constants.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts
│   │   ├── decorators/
│   │   ├── dto/
│   │   └── guards/
│   ├── config/                     # environment validation
│   └── db/                         # Prisma/database integration
│       ├── db.module.ts
│       ├── db.service.ts
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── schema.sql
│       └── seed.ts
├── Dockerfile
├── prisma.config.ts
├── .env.example
└── package.json
```

The feature-module directory has **not yet been scaffolded in this repository snapshot**. When the Dev Leads add it, the intended layout is:

```text
apps/backend/src/modules/
├── flight-scheduling/
├── booking-search/
├── booking-pnr/
├── pricing/
├── payments-checkout/
├── payments-refunds/
├── checkin-boarding/
├── passenger-profiles/
├── crew-rostering/
├── aircraft-management/
├── baggage/
├── cargo/
├── onboard-products/
├── customer-service/
├── bi-dashboards/
└── admin-console/
```

## Inside a feature module

The planned standard NestJS shape is:

```text
modules/<module-name>/
├── <module-name>.module.ts
├── <module-name>.controller.ts
├── <module-name>.service.ts
├── dto/
└── <module-name>.service.spec.ts
```

## Rules

1. **One team, one module folder.** Do not edit another team's module without the relevant review.
2. **Use NestJS module boundaries.** If Module A needs functionality from Module B, consume what B exports through its module interface. Do not import B's internal files directly.
3. **Authentication is centralized.** The existing `AuthModule` installs a global JWT guard. Feature modules should use the authenticated request user rather than implementing their own token verification.
4. **Database access is centralized.** Feature teams do not create independent Prisma schemas or migrations.
5. **Configuration is centralized.** Runtime environment validation is handled by `src/config/env.validation.ts`.
6. **Keep cross-module API contracts explicit.** Changes that affect another team's endpoint or response contract must be discussed with the affected team before implementation.

## Authentication interface currently available

Global prefix:

```text
/api
```

Current authentication endpoints:

```text
POST /api/auth/session
POST /api/auth/refresh
POST /api/auth/logout
```

See [`infra-guide.md`](./infra-guide.md) for the full flow.

## Important current-state note

The repository currently does **not** contain `src/core/`, `src/shared/`, or `src/prisma/` directories described in older versions of this document. The implemented equivalents are currently `src/auth/`, `src/config/`, and `src/db/`.
