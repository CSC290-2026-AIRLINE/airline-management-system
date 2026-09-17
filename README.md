# Airline Management System (Monorepo)

A centralized monorepo architecture powering the Airline Management System (CSC290 Integrated Project I).

---

## Monorepo Layout

```text
airline-management-system/
├── apps/
│   ├── backend/        # NestJS, Prisma, OpenAPI (Swagger), MinIO
│   ├── customer-web/   # React, shadcn/ui, Tailwind CSS, TanStack Query
│   └── staff-web/      # React, shadcn/ui, Tailwind CSS, TanStack Query
├── db/                 # PostgreSQL schemas, migrations, seeds
├── docs/               # System architecture, workflows, module boundaries
└── docker-compose.yml
```

---

## Quick Start (Local Development)

### 1. Prerequisites

- Node.js v18+ — [Download & install guide](https://nodejs.org/en/download)
- npm (bundled with Node.js, used here for workspaces) — [Install/update guide](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- Docker Desktop — [Download & install guide](https://docs.docker.com/desktop/)

### 2. Install Dependencies

Run once from the repo root — this installs and links `apps/backend`, `apps/customer-web`, and `apps/staff-web` together via npm workspaces.

```bash
npm install
```

### 3. Run Everything

```bash
npm run dev
```

This starts local services (PostgreSQL 16 and MinIO, via `db:up`) and then runs all three apps together — backend, customer-web, and staff-web.

- Postgres: `localhost:5432`
- MinIO S3 API: `localhost:9000` (Console: `localhost:9001`, login `minioadmin` / `minioadminpassword`)
- Backend API: `localhost:8080`
- Customer web: `localhost:5151`
- Staff web: `localhost:6161`

Starting the services also spins up a fourth, short-lived container, `airline_minio_init` — a one-shot bootstrap job that waits for MinIO, creates the `airline-public` and `airline-private` buckets, sets `airline-public` to public-read, then exits. It's expected to show `Exited (0)` in `docker ps -a`; you don't need to run anything against it.

Stopping `npm run dev` (Ctrl+C) only stops the apps — Postgres and MinIO keep running in the background. Stop them explicitly when you're done for the day:

```bash
npm run db:down
```

Tail their logs:

```bash
npm run db:logs
```

Restart just the services without the apps:

```bash
npm run db:up
```

### 4. Running Apps Individually

To run just one app instead of all three, target its workspace with `-w` (make sure `npm run db:up` has been run first if the backend needs Postgres/MinIO):

```bash
npm run start:dev -w apps/backend      # NestJS, watch mode
npm run dev -w apps/customer-web       # Vite dev server
npm run dev -w apps/staff-web          # Vite dev server
```

### 5. Build, Lint & Test

Each app is an npm workspace, so any script in its `package.json` can be run the same way:

```bash
# Build
npm run build -w apps/backend
npm run build -w apps/customer-web
npm run build -w apps/staff-web

# Lint
npm run lint -w apps/backend
npm run lint -w apps/customer-web
npm run lint -w apps/staff-web

# Backend tests
npm run test -w apps/backend           # unit tests
npm run test:e2e -w apps/backend       # e2e tests
npm run test:cov -w apps/backend       # coverage
```

---

## Git Workflow & Governance

### - Branch Targets:

- Feature branches (from groups) branch off and target `dev`.
- Only `dev` can be merged into `main`.

### - Pull Requests & Reviews:

- PRs to `dev` (from groups) require 2 approvals + Code Owner review.
- Merging into `dev` uses Squash and Merge (managed by Dev Leads).
- Merging into `main` uses Merge Commit (managed by Infra Leads).

### - Coding Standards:

- AI Agent (MiniMax (tbc)) and manual code must follow rules defined in docs

IDE - vscode
if you can't see some files, check .vscode/settings.json for hidden files settings
