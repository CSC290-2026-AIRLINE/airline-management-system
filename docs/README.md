# Airline Management System — Project Docs

This repository is a unified **Monorepo** containing all services, database schemas, and documentation, Holds the shared rules every team (G01–G16) and lead follows. If it's not written here, it's not a rule — raise it with the Infra Leads to get it added.

## Architecture Layout

- `/apps/backend` — NestJS monolith API, Prisma ORM, OpenAPI/Swagger, MinIO, Redis
- `/apps/frontend` — React (Vite), Tailwind CSS, shadcn/ui, TanStack Query (no raw fetch)
- `/database` — Centralized Prisma schema, migrations, seeds, ERD
- `/docs` — System rules, workflows, architecture docs

## Start here

| Doc                                                                | What it's for                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [`branch-naming-and-workflow.md`](./branch-naming-and-workflow.md) | Branch names, commit messages, PR rules, review process — read this first |
| [`backend-structure.md`](./backend-structure.md)                   | Folder structure for the `backend`, module boundaries                     |
| [`frontend-structure.md`](./frontend-structure.md)                 | Folder structure for the `frontend`                                       |
| [`database-structure.md`](./database-structure.md)                 | Migration structure, naming, ownership rules for the `database`           |

## Non-negotiable rules (summary)

1. No direct commits to `main`. Ever. Not even leads.
2. Every PR needs 1 approval + code owner approval (enforced automatically by branch protection + `CODEOWNERS`).
3. Branch and commit naming must follow `branch-naming-and-workflow.md` exactly — PRs that don't follow it get requested-changes, not merged.
4. Don't touch another team's folder without that team (or a lead) reviewing your PR — `CODEOWNERS` will request them automatically if you do.
5. Cross-module API contracts freeze by week 3–4. After that, changing another team's API is a conversation, not a PR.

## Who to ask

- Branching/Git/CI questions → Infra Leads
- Backend architecture/folder questions → Dev Leads
- Database/migration questions → DB Leads
- Everything else → your PM/Coordinator

_Last updated: draft v1, structure expected to change 1–2 times before development starts. Check git blame / PR history on this repo for the latest._
