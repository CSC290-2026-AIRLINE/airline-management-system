# Project Setup

Local development setup for the Airline Management System monorepo.

## 1. Prerequisites

- Node.js v24 (LTS), pinned in `.nvmrc`; run `nvm use` in the repo root. Older versions are refused by `npm install` — [Download & install guide](https://nodejs.org/en/download)
- npm (bundled with Node.js, used here for workspaces) — [Install/update guide](https://docs.npmjs.org/downloading-and-installing-node-js-and-npm)
- Docker Desktop — [Download & install guide](https://www.docker.com/desktop/)

Use the repository's Node version:

```bash
nvm use
```

## 2. Configure Environment Variables

Create local environment files from the examples:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/customer-web/.env.example apps/customer-web/.env
cp apps/staff-web/.env.example apps/staff-web/.env
```

replace content with provided env files

## 3. Install Dependencies

Run once from the repo root — this installs and links `apps/backend`, `apps/customer-web`, and `apps/staff-web` together via npm workspaces.

```bash
npm install
```

Run `npm install` again after every `git pull`. It no longer generates the Prisma client; run `npm run db:generate` (see step 5).

Before starting the apps for the first time, start Docker Desktop and apply the committed database migrations (see step 7):

```bash
npm run db:up
npm run db:prepare
```

## 5. Start Everything (peak command)

Generate the Prisma client first. Run it before the first `npm run dev` and again after every `git pull` that changes the schema, otherwise the backend fails to build with errors about missing tables or fields.

```bash
npm run db:generate
npm run dev
```

Current application ports:

- Backend API: `http://localhost:8080`
- Customer web: `http://localhost:5151`
- Staff web: `http://localhost:6161`
- PostgreSQL 16: `localhost:5432`
- SeaweedFS S3 API: `localhost:8333`

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

## 6. Running Apps Individually

```bash
npm run start:dev -w apps/backend
npm run dev -w apps/customer-web
npm run dev -w apps/staff-web
```

## 7. Database Commands

```bash
npm run db:migrate
npm run db:migrate:deploy
npm run db:migrate:reset
npm run db:studio
npm run db:seed
```

`npm run db:studio` opens Prisma Studio, a browser GUI (default `http://localhost:5555`) for browsing and editing rows in your local database. It needs PostgreSQL running (`npm run db:up`) and only touches your local data, not the schema.

**Feature groups must not edit `src/db/prisma/schema.prisma` or create migrations.** The schema is owned by the Database Team. If you need a table or column changed, ask them; once their change is merged, pull and run `npm run db:generate` (and `npm run db:migrate`).

See [`docs/infra-guide.md`](./docs/infra-guide.md) for the authentication flow and configuration rules.

## 8. Claude Code Setup (Optional, may use claude vscode extension)

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview), this repo ships a `.claude/settings.example.json` template so teammates share a common permissions baseline. Copy it locally and customize:

```bash
cp .claude/settings.example.json .claude/settings.json
```

- The copied `.claude/settings.json` is gitignored, so personal `env` entries (custom API endpoint, keys, model overrides) stay local and out of git history.
- Adjust the `permissions.allow` and `permissions.deny` lists to match your workflow.
- Replace or remove the example `env` block if you don't use a custom model endpoint.

## G10 Staff Feature Testing

See [G10 local testing](docs/g10-local-testing.md) for the fresh-checkout sequence, local Security role assignment and persisted Watchlist verification. Backend development startup, tests and builds now generate Prisma Client automatically. This does not apply database migrations automatically; run `npm run db:prepare` after pulling database changes.
