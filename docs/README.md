# Airline Management System — Project Docs

This repository is a unified **npm monorepo** containing the backend, customer web app, staff web app, database layer, and shared project documentation.

This documentation is the shared reference for G01–G16 and the project leads. Where a document conflicts with the actual repository, update the document or raise the mismatch with the responsible lead rather than inventing a new convention in a feature branch.

## Current architecture

- `/apps/backend` — NestJS monolith API, Prisma, authentication, configuration, and database access
- `/apps/customer-web` — React/Vite customer application
- `/apps/staff-web` — React/Vite staff application
- `/apps/backend/src/db` — centralized Prisma schema, migrations, seed, and SQL schema snapshot
- `/docs` — system rules, workflows, architecture, and onboarding guidance
- `/docker-compose.yml` — local PostgreSQL + SeaweedFS (S3 storage) infrastructure
- `/docker-compose.prod.yml` — current multi-container deployment definition

## Start here

| Document | Purpose |
|---|---|
| [`infra-guide.md`](./infra-guide.md) | Group-facing infrastructure guide: architecture, stack, setup, auth, environment, deployment, and infra rules |
| [`branch-naming-and-workflow.md`](./branch-naming-and-workflow.md) | Branch names, commits, PR flow, reviews, and merge authority |
| [`backend-structure.md`](./backend-structure.md) | Current NestJS structure and backend module boundaries |
| [`frontend-structure.md`](./frontend-structure.md) | Current customer/staff frontend structure and planned feature organization |
| [`database-structure.md`](./database-structure.md) | Current Prisma location, migration ownership, naming, and DB workflow |

## Shared rules summary

1. Feature groups do not push directly to protected integration/release branches; they work through the documented PR flow.
2. Database models and migrations are owned centrally by the Database Team.
3. Authentication is provided centrally; feature modules do not create their own auth flow.
4. Infrastructure/configuration changes are reviewed by Infra Leads.
5. Cross-module API and data changes must be coordinated with the affected teams.

## Who to ask

- Branching, CI/CD, Docker, deployment, environment configuration → Infra Leads
- Backend module architecture and API conventions → Dev Leads
- Prisma schema and migrations → Database Leads
- UI/UX and design system → UI/UX Leads
- Feature requirements and cross-feature coordination → Feature Leads / PM / Coordinator

_Last reviewed against the repository snapshot from September 28, 2026._
