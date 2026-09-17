# Airline Management System — Project Docs

This repository is a unified **Monorepo** containing all services, database schemas, and documentation. Holds the shared rules every team (G01–G16) and lead follows. If it's not written here, it's not a rule — raise it with the Infra Leads to get it added.

## Architecture Layout

- `/apps/backend` — NestJS monolith API, Prisma ORM, OpenAPI/Swagger, MinIO
- `/apps/customer-web` — React (Vite), Tailwind CSS, shadcn/ui, TanStack Query
- `/apps/staff-web` — React (Vite), Tailwind CSS, shadcn/ui, TanStack Query
- `/db` — Centralized Prisma schema, migrations, seeds, ERD
- `/docs` — System rules, workflows, architecture docs

## Start here

| Doc                                                                | What it's for                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [`branch-naming-and-workflow.md`](./branch-naming-and-workflow.md) | Branch names, commit messages, PR rules, review process — read this first |
| [`backend-structure.md`](./backend-structure.md)                   | Folder structure for the `backend`, module boundaries                     |
| [`frontend-structure.md`](./frontend-structure.md)                 | Folder structure for the frontends (`customer-web`, `staff-web`)          |
| [`database-structure.md`](./database-structure.md)                 | Migration structure, naming, ownership rules for the database (`db`)     |

## Non-negotiable rules (summary)

1. Groups never push directly to `dev` or `main` — only through PR. Dev Leads and Infra Leads are the exception: they hold merge/push rights on `dev` and `main` respectively as branch administrators.
2. Every group PR into `dev` needs **2 approvals + Code Owner approval** (enforced by branch protection + `CODEOWNERS`). PRs into `main` come only from `dev` and are merged exclusively by Infra Leads.
3. Branch and commit naming must follow `branch-naming-and-workflow.md` exactly — PRs that don't follow it get requested-changes, not merged.
4. Don't touch another team's folder without that team (or a lead) reviewing your PR — `CODEOWNERS` will request them automatically if you do.
5. Cross-module API contracts freeze by week 3–4. After that, changing another team's API is a conversation, not a PR.

## Who to ask

- Branching/Git/CI questions → Infra Leads
- Backend architecture/folder questions → Dev Leads
- Database/migration questions → DB Leads
- Everything else → your PM/Coordinator

_Last updated: reflects Redis removal and finalized branch protection rules. Structure may still shift as module folders and CI/CD get built out — check PR history on this repo for the latest._
