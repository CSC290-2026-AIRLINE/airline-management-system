# Backend Structure

Monolith. One NestJS app (`apps/backend`), one module folder per team. Part of the pnpm monorepo — deployed as one of three Docker images (backend, frontend, database-related tooling) built by CI and pulled onto the project VM; locally it runs via `pnpm dev`, not containerized.

Prisma is the ORM. **Models live in one centralized schema** (`database/prisma/schema.prisma`), not per-module — see `database-structure.md`. Backend modules import the generated Prisma client; they do not own their own model files.

## Folder skeleton

```
apps/backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── core/                       # auth, RBAC, JWKS — dev leads + infra leads only
│   ├── modules/
│   │   ├── flight-scheduling/
│   │   ├── booking-search/
│   │   ├── booking-pnr/
│   │   ├── pricing/
│   │   ├── payments-checkout/
│   │   ├── payments-refunds/
│   │   ├── checkin-boarding/
│   │   ├── passenger-profiles/
│   │   ├── crew-rostering/
│   │   ├── aircraft-management/
│   │   ├── baggage/
│   │   ├── cargo/
│   │   ├── onboard-products/
│   │   ├── customer-service/
│   │   ├── bi-dashboards/
│   │   └── admin-console/
│   ├── shared/                      # guards, interceptors, pipes, common utils — dev lead review required
│   ├── config/                      # env config module (ConfigModule setup)
│   └── prisma/                      # PrismaService wrapper around the generated client
├── test/                            # e2e tests
├── .env.example
└── README.md
```

## Inside each module folder

Standard NestJS module shape (tests are colocated next to the code they test — NestJS convention, no separate `tests/` mirror folder):

```
modules/<module-name>/
├── <module-name>.module.ts       # declares the module, its imports/exports — this IS the public interface
├── <module-name>.controller.ts   # routes
├── <module-name>.service.ts      # business logic
├── dto/                           # request/response DTOs, validated with class-validator
└── <module-name>.service.spec.ts # unit tests
```

## Rules

1. **One team, one folder.** Your team only writes inside `src/modules/<your-module>/`. Anything outside needs the owning team's (or a lead's) review — enforced by `CODEOWNERS` once per-module entries are added (see status note below).

2. **Module boundaries are enforced through NestJS's own module system, not just convention.** A module only exposes what it lists in its `exports` array. If Module A needs something from Module B, Module A imports Module B's module and injects its exported service — standard NestJS dependency injection. Module A must never import a file from deep inside Module B's folder directly. If B doesn't export what A needs, A asks B to export it.

3. **`core/` and `shared/` are not team folders.** Changes there need dev lead sign-off regardless of who's making them — these are load-bearing for every module.

4. **Data models are not yours to add locally.** If your module needs a new table/model, you edit `database/prisma/schema.prisma` (see `database-structure.md`), not a local model file — there is one Prisma schema for the whole system.

5. **Every module folder needs a short comment block at the top of its `.module.ts`** stating what it does and what it depends on. This is what other teams read before asking questions in Discord.

## Status

Structure may still shift slightly as dev leads scaffold the actual 16 module folders. Once module folders exist, `CODEOWNERS` needs a line per module (`/apps/backend/src/modules/booking-pnr/ @CSC290-2026-AIRLINE/g03`) — currently the whole of `apps/backend/` is owned broadly by `development-leads` as a placeholder.
