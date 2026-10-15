# Airline Management System (Monorepo)

A centralized npm monorepo powering the Airline Management System (CSC290 Integrated Project I). This README is the shared reference for G01–G16 and the project leads. Where information conflicts with the actual repository, update the documentation or raise the mismatch with the responsible lead rather than inventing a new convention in a feature branch.

## Repository Layout

```text
airline-management-system/
├── apps/
│   ├── backend/        # NestJS API, Prisma, authentication
│   ├── customer-web/   # React + Vite customer app
│   └── staff-web/      # React + Vite staff app
├── docs/               # shared architecture, workflows, and onboarding docs
├── docker-compose.yml  # local PostgreSQL + SeaweedFS (S3 storage)
├── docker-compose.prod.yml
├── package.json        # npm workspaces and root scripts
└── package-lock.json
```

The centralized Prisma schema is **inside the backend application** at:

```text
apps/backend/src/db/prisma/schema.prisma
```

## Current Architecture

- `/apps/backend` — NestJS monolith API, Prisma, authentication, configuration, and database access
- `/apps/customer-web` — React/Vite customer application
- `/apps/staff-web` — React/Vite staff application
- `/apps/backend/src/db` — centralized Prisma schema, migrations, seed, and SQL schema snapshot
- `/docs` — system rules, workflows, architecture, and onboarding guidance
- `/docker-compose.yml` — local PostgreSQL + SeaweedFS (S3 storage) infrastructure
- `/docker-compose.prod.yml` — current multi-container deployment definition

## Quick Start (Local Development)

See [`setup.md`](./setup.md) for prerequisites, dependency installation, environment configuration, local infrastructure (PostgreSQL + SeaweedFS), and database commands.

## Build, Lint, Format & Test

CI runs these on every pull request; run them before you push. Replace `<app>` with `backend`, `customer-web`, or `staff-web`.

```bash
npm run lint -w apps/<app>           # report lint problems
npm run lint:fix -w apps/<app>       # fix what can be fixed automatically
npm run format:check -w apps/<app>   # report formatting problems
npm run format -w apps/<app>         # fix formatting
npm run build -w apps/<app>
```

Backend tests (`*.spec.ts` files next to the code they test):

```bash
npm run test -w apps/backend
npm run test:cov -w apps/backend
```

## Documentation

| Document | Purpose |
|---|---|
| [`setup.md`](./setup.md) | Local development setup: prerequisites, install, env config, infra, database commands |
| [`docs/infra-guide.md`](./docs/infra-guide.md) | Group-facing infrastructure guide: architecture, stack, setup, auth, environment, deployment, and infra rules |
| [`docs/branch-naming-and-workflow.md`](./docs/branch-naming-and-workflow.md) | Branch names, commits, PR flow, reviews, and merge authority |
| [`docs/backend-structure.md`](./docs/backend-structure.md) | Current NestJS structure and backend module boundaries |
| [`docs/frontend-structure.md`](./docs/frontend-structure.md) | Current customer/staff frontend structure and planned feature organization |
| [`docs/database-structure.md`](./docs/database-structure.md) | Current Prisma location, migration ownership, naming, and DB workflow |

## Shared Rules

1. Feature groups do not push directly to protected integration/release branches; they work through the documented PR flow.
2. Database models and migrations are owned centrally by the Database Team.
3. Authentication is provided centrally; feature modules do not create their own auth flow.
4. Infrastructure/configuration changes are reviewed by Infra Leads.
5. Cross-module API and data changes must be coordinated with the affected teams.

## Who to Ask

- Branching, CI/CD, Docker, deployment, environment configuration → Infra Leads
- Backend module architecture and API conventions → Dev Leads
- Prisma schema and migrations → Database Leads
- UI/UX and design system → UI/UX Leads
- Feature requirements and cross-feature coordination → Feature Leads / PM / Coordinator

## Git Workflow

- Feature branches start from `dev`.
- Feature PRs target `dev`.
- Feature PRs use the documented review/approval rules.
- Releases move from `dev` to `main`.
- Infra Leads handle the release merge into `main` according to the repository workflow document.

See [`docs/branch-naming-and-workflow.md`](./docs/branch-naming-and-workflow.md).

_Last reviewed against the repository snapshot from September 28, 2026._