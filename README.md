# Airline Management System (Monorepo)

A centralized npm monorepo powering the Airline Management System (CSC290 Integrated Project I).

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

---

## Quick Start (Local Development)

### 1. Prerequisites

- Node.js v24 (LTS), pinned in `.nvmrc`; run `nvm use` in the repo root. v22.12+ also works — [Download & install guide](https://nodejs.org/en/download)
- npm (bundled with Node.js, used here for workspaces) — [Install/update guide](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- Docker Desktop — [Download & install guide](https://docs.docker.com/desktop/)

Use the repository's Node version:

```bash
nvm use
```

### 2. Install Dependencies

Run once from the repo root — this installs and links `apps/backend`, `apps/customer-web`, and `apps/staff-web` together via npm workspaces.

```bash
npm install
```

For a clean lockfile-based install:

```bash
npm ci
```

### 3. Configure Environment Variables

Create local environment files from the examples:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/customer-web/.env.example apps/customer-web/.env
cp apps/staff-web/.env.example apps/staff-web/.env
```

The backend requires database, JWT, and both Clerk secret-key configuration values. Each frontend requires its own Clerk publishable key and the backend API URL. See [`docs/infra-guide.md`](./docs/infra-guide.md) for the authentication flow and configuration rules.

### 4. Start Local Infrastructure

```bash
npm run db:up
```

This starts:

- PostgreSQL 16: `localhost:5432`
- SeaweedFS S3 API: `localhost:8333`

A one-shot initialization container also creates the `airline-public` and `airline-private` buckets. Seeing `airline_seaweedfs_init` exit successfully is expected. Docker Compose 2.23.1 or newer is required (`docker compose version`).

### 5. Start Everything

```bash
npm run dev
```

Current application ports:

- Backend API: `http://localhost:8080`
- Customer web: `http://localhost:5151`
- Staff web: `http://localhost:6161`

`npm run dev` starts the three applications after bringing up PostgreSQL and SeaweedFS. Stopping it does not stop those infrastructure containers; use:

```bash
npm run db:down
```

Logs:

```bash
npm run db:logs
```

Restart infrastructure only:

```bash
npm run db:up
```

### 6. Running Apps Individually

```bash
npm run start:dev -w apps/backend
npm run dev -w apps/customer-web
npm run dev -w apps/staff-web
```

### 7. Database Commands

```bash
npm run db:migrate
npm run db:migrate:deploy
npm run db:migrate:reset
npm run db:studio
npm run db:seed
```

## Build & Lint

```bash
npm run build -w apps/backend
npm run build -w apps/customer-web
npm run build -w apps/staff-web

npm run lint -w apps/backend
npm run lint -w apps/customer-web
npm run lint -w apps/staff-web
```

Backend tests:

```bash
npm run test -w apps/backend
npm run test:e2e -w apps/backend
npm run test:cov -w apps/backend
```

## Documentation

Start with [`docs/README.md`](./docs/README.md), especially [`docs/infra-guide.md`](./docs/infra-guide.md) for group onboarding.

## Git Workflow

- Feature branches start from `dev`.
- Feature PRs target `dev`.
- Feature PRs use the documented review/approval rules.
- Releases move from `dev` to `main`.
- Infra Leads handle the release merge into `main` according to the repository workflow document.

See [`docs/branch-naming-and-workflow.md`](./docs/branch-naming-and-workflow.md).
