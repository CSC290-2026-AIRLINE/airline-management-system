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

Run `npm install` again after every `git pull`; it also regenerates the Prisma client.

Before starting the apps for the first time, apply database migrations (see step 7):

```bash
npm run db:migrate
```

## 5. Start Everything (peak command)

```bash
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

See [`docs/infra-guide.md`](./docs/infra-guide.md) for the authentication flow and configuration rules.
