# Backend (NestJS + Prisma)

Single NestJS monolith. Global prefix `/api`, port 8080. See the root `CLAUDE.md` for repo-wide rules and `docs/backend-structure.md` for module boundaries.

## Commands (from repo root, or drop `-w` inside this folder)

```bash
npm run db:generate                   # from repo root: generate the Prisma client; needed before start:dev, test and build
npm run start:dev -w apps/backend     # watch mode
npm run lint -w apps/backend
npm run format:check -w apps/backend  # `format` to fix
npm run test -w apps/backend          # Jest, files match *.spec.ts
npm run build -w apps/backend
npm run db:seed -w apps/backend
```

Run lint, format:check, test and build before declaring work done; CI runs the same.

## Layout

```text
src/
├── main.ts, app.module.ts
├── auth/      # Clerk exchange, JWT guard, decorators, DTOs (platform-owned)
├── config/    # env.validation.ts (platform-owned)
├── db/        # DbModule/DbService, prisma/schema.prisma, migrations, seed (Database Team)
└── modules/   # PLANNED: one folder per feature team; may not exist yet
```

Import with the `@backend/*` alias (maps to `src/*`), for example `@backend/auth/decorators/public.decorator`. Do not use deep relative paths across folders.

A feature module follows the standard shape: `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`, `dto/`, `<name>.service.spec.ts`. Register it in `AppModule` only when asked.

## Authentication (already built, use it)

- `JwtAuthGuard` is global, so **every route needs a Bearer access token by default**. Mark a route open only with `@Public()`, and only when it truly must be public.
- Get the caller with `@CurrentUser()` (`{ id, email }`). Do not re-verify tokens or parse the `Authorization` header yourself.
- The flow is `POST /api/auth/session` (Clerk token to our access and refresh tokens), then `/api/auth/refresh` and `/api/auth/logout`. Customer and staff use separate Clerk secrets (`CLERK_SECRET_KEY_CUSTOMER` / `_STAFF`).
- Staff roles are not enforced yet (new staff default to `admin`). Do not assume role-based guards exist; ask before adding one.

## Database

- Use `DbService` (Prisma client over the `pg` adapter) via dependency injection. Never `new PrismaClient()`.
- Do **not** edit `src/db/prisma/schema.prisma`, migrations, or `schema.sql` unless the task is a Database Team change. Propose the schema change in text instead.
- Model and column names are `snake_case` (`user`, `refresh_token`, `created_at`). Soft delete uses `deleted_at`, so filter on it in queries.
- A partial unique key (`@unique(where: ...)` in `schema.prisma`, such as `tail_number`, `sku` or `promo_code.code`) is unique among live rows only, but Prisma still accepts it in `findUnique`, which can then return a soft-deleted or voided row. Add the live filter: `findUnique({ where: { tail_number, deleted_at: null } })`. One-to-one relations over such keys (`flight.flight_report`, `flight.aircraft_turnaround`) have the same catch, so query that model with the filter instead of including the relation.
- After pulling a schema change, run `npm run db:generate`. A stale client shows up as type errors about missing models or fields; fix it by regenerating, not by editing code.
- Schema changes need `npm run db:migrate` and a committed migration; CI fails if `schema.prisma` and migrations drift.

## Conventions

- Validate input at the boundary with DTOs. Return explicit Nest exceptions (`NotFoundException`, `UnauthorizedException`), not raw errors.
- Keep controllers thin; business logic lives in services. Services are injectable and unit-testable with mocked `DbService`.
- Never log tokens, Clerk keys, emails in bulk, or request bodies from auth routes.
- Another team's module is consumed only through its exported providers, never by importing its internal files.
- New env vars: update `.env.example` and `config/env.validation.ts` (plus its spec) together.
- Add a `*.spec.ts` for new service logic. Tests must not need a live database or Clerk.
- Formatting is Prettier: no semicolons, single quotes, 140 columns.

## Best Practices

- Validate every input at the boundary with a DTO using `class-validator`. Never rely on "the frontend validated it."
- Throw typed Nest exceptions (`NotFoundException`, `ConflictException`, …), not raw `Error` / Prisma errors. Map Prisma codes like `P2002` / `P2025` at the service boundary, not in controllers.
- Wrap multi-write flows in `prisma.$transaction([...])` so partial failures roll back. Never chain mutations on the implicit auto-commit.
- Avoid N+1 queries. Use `include` / `select` to load relations in one query; loop-with-query is a code-review red flag.
- Use Nest's `Logger`, not `console`. Pick `log` / `warn` / `error` by signal, not by mood. Never log raw request bodies, tokens, Clerk payloads, or PII.
- Add one `*.service.spec.ts` per non-trivial service. Mock `DbService` with a Jest manual mock; never hit a real DB in unit tests.
- Shape responses with DTOs (`class-transformer`) when the model has sensitive columns (hashed passwords, internal flags). `@Expose()` only what's needed.
- New env var? Update `.env.example` and `src/config/env.validation.ts` (with its spec test) in the same change.
- Time fields are UTC at rest. Format on the boundary; don't mix `Date.now()` vs `new Date().getTime()` across modules.
- Pagination: prefer `cursor` over `offset` for large lists. Document the contract on the DTO.
