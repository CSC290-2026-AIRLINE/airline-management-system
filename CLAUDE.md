# Airline Management System

npm-workspaces monorepo for CSC290 Integrated Project I. About 16 feature groups (G01–G16) plus platform leads work in it, so shared code has strict ownership. Each app has its own `CLAUDE.md`; this file covers what applies everywhere.

| App | Stack | Port |
|---|---|---|
| `apps/backend` | NestJS, Prisma, PostgreSQL 16 (API prefix `/api`) | 8080 |
| `apps/customer-web` | React 19, Vite, TanStack Router, Clerk | 5151 |
| `apps/staff-web` | Same stack, separate Clerk app | 6161 |

Deeper docs are in `docs/` (`infra-guide.md`, `backend-structure.md`, `frontend-structure.md`, `database-structure.md`, `branch-naming-and-workflow.md`). Read them instead of guessing. If a doc and the code disagree, trust the code and flag the mismatch.

## Commands (run from repo root)

```bash
nvm use                 # Node 24, pinned in .nvmrc
npm install             # also runs `prisma generate`; rerun after every git pull
npm run db:up           # PostgreSQL + SeaweedFS in Docker
npm run dev             # backend + both web apps
npm run db:migrate | db:seed | db:studio
npm run <script> -w apps/<app>   # lint, format:check, test, build for one app
```

CI (`.github/workflows/ci.yml`) runs lint, format check, backend tests and build for every app, plus a migration/schema consistency check. Run the same checks for the app you touched before saying work is done.

## Rules for every change

- **Stay in your lane.** Feature work goes inside one team's module or feature folder. Do not edit another team's folder, shared code, auth, or config unless asked, and say so when you do.
- **Auth is centralized.** Never build a new login, token or session flow. Use the existing `AuthModule` (backend) and `AuthProvider` (frontends).
- **The database is centralized.** Do not edit `schema.prisma` or create migrations unless the task is explicitly a Database Team task. Do not create separate Prisma clients.
- **Config is centralized.** Add new env vars to `.env.example` and to `src/config/env.validation.ts` together.
- **Check before importing.** shadcn/ui, Tailwind, Lucide and TanStack Query are planned but not installed. Read the app's `package.json` before using any package.
- **Don't invent structure.** `src/modules/` (backend) and `src/features/` (frontends) are planned and may not exist yet. SeaweedFS is provisioned but unused by code.
- **Secrets.** Never read, print or commit `.env*` files (only `.env.example`), Clerk keys, or `ACCESS_TOKEN_SECRET`.
- **Destructive commands need explicit approval:** `prisma migrate reset`, `docker compose down -v`, `git push --force`, `git reset --hard`.

## Code style

Prettier is the source of truth (no semicolons, single quotes, trailing commas, 140 columns). Run `npm run format` and `npm run lint:fix` in the app instead of hand-formatting. Match the surrounding code's naming and comment density. Prefer small, focused diffs (the team target is under about 400 lines per PR).

## Git workflow

- Branch off `dev`, never commit to `dev` or `main` directly: `<type>/<team-id>-<short-description>`, for example `feature/g03-seat-hold-ttl`. `team-id` is `g01`–`g16` or `core`.
- Commits are Conventional Commits scoped by team ID: `feat(g03): add seat hold TTL`. Subject under about 72 characters. Types: `feat fix refactor chore docs test style`.
- PR title: `[G03] Add seat hold TTL`. Use `.github/pull_request_template.md`. PRs target `dev`; only Dev Leads merge them (squash). Only Infra Leads merge `dev` into `main`.
- Only commit or push when the user asks. Ask for the team ID if it isn't clear.

## Working style

- Read the relevant files before editing. Keep changes minimal and on-task; do not refactor unrelated code.
- For anything non-trivial, state a short plan first, then implement in small steps.
- After editing, run lint and the relevant tests or build, and report the real output, including failures.
- If a request would break a rule above, say so and ask instead of working around it.
