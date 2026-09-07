# Airline Management System (Monorepo)

A centralized monorepo architecture powering the Airline Management System (CSC290 Integrated Project I).

---

## Monorepo Layout

```text
airline-system/
├── apps/
│   ├── backend/       # NestJS, Prisma, OpenAPI (Swagger), Redis, MinIO
│   └── frontend/      # React, shadcn/ui, Tailwind CSS, TanStack Query
├── database/          # PostgreSQL schemas, migrations, seeds
├── docs/              # System architecture, workflows, module boundaries
├── docker-compose.dev.yml
└── pnpm-workspace.yaml
```

---

## Quick Start (Local Development)

### 1. Prerequisites

- Node.js: v18+
- Package Manager: pnpm (run corepack enable if missing)
- Docker Desktop

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Start Local Services (Starts PostgreSQL 16, Redis 7, and MinIO)

```bash
pnpm db:up
```

- Postgres: `localhost:5432`
- Redis: `localhost:6379`
- MinIO S3 API: `localhost:9000` (Console: `localhost:9001`)

### 4. Run Applications (Run backend and frontend concurrently)

```bash
pnpm dev
```

---

## Git Workflow & Governance

### - Branch Targets:

- Never push directly to `dev` or `main`.
- Feature branches branch off and target `dev`.
- Only `dev` can be merged into `main`.

### - Pull Requests & Reviews:

- PRs to `dev` require 2 approvals + Code Owner review.
- Merging into `dev` uses Squash and Merge (managed by Dev Leads).
- Merging into `main` uses Merge Commit (managed by Infra Leads).

### - Coding Standards:

- AI Agent (MiniMax) and manual code must follow rules defined in docs
