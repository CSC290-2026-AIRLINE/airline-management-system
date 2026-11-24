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

## Payments (Feature 5) and Stripe test mode

Payments run on a **fake provider** by default (`PAYMENT_PROVIDER` unset): nothing to set up, a payment settles on the spot. To try the
real card flow you need your own [Stripe](https://dashboard.stripe.com/register) account, in **test mode** (the backend refuses a live key).

1. **Keys.** In the Stripe dashboard switch **Test mode** on, open **Developers → API keys** and copy the **Secret key** (`sk_test_…`). The app
   uses Stripe's hosted checkout page, so the publishable key (`pk_test_…`) is not needed.
2. **`apps/backend/.env`** (never commit it; `.env.example` lists the names, empty):

   ```
   PAYMENT_PROVIDER="stripe"
   STRIPE_SECRET_KEY="sk_test_…"
   STRIPE_WEBHOOK_SECRET="whsec_…"      # step 3
   ```

3. **Webhooks.** Stripe cannot reach `localhost`, so the Stripe CLI forwards its events to `/api/webhooks/stripe`. It is a dev dependency
   (`@stripe/cli`, installed by `npm install`) and **`npm run dev` starts it for you** when the provider is `stripe`. Print its signing secret once and
   put it in `STRIPE_WEBHOOK_SECRET`; it is the same every time for your account and machine:

   ```bash
   STRIPE_API_KEY="sk_test_…" node_modules/.bin/stripe listen --print-secret
   ```

4. **Run and pay.** Restart `npm run dev` (`.env` is read at startup), then pay a held booking on Review & Pay. Test cards: `4242 4242 4242 4242`
   succeeds, `4000 0000 0000 0002` is declined, `4000 0025 0000 3155` asks for 3-D Secure; any future expiry and any CVC.

If the backend logs `Webhook rejected: its signature does not match`, the `whsec_` in `.env` is not the CLI's (step 3), or you also have a hand-started
`stripe listen` running next to the one from `npm run dev`. A payment still completes after about two minutes through the reconcile job; the webhook
makes it instant.

Staff pages are under **Payments & Refunds** in the staff sidebar; customers find Receipts, My refunds and My vouchers under **Receipts** in the
header. Details, the payment states and the module contracts are in
[`apps/backend/src/modules/payments-checkout/README.md`](./apps/backend/src/modules/payments-checkout/README.md).

### Testing payments

```bash
npm run test -w apps/backend -- payments-      # unit tests, no database
```

The smoke scripts run the whole app against a real database through the real routes (the fake provider, no Stripe account). They write rows that
cannot be deleted (the finance journal and audit log are append-only), so **run them on a copy of the database**, never the one you work in:

```bash
docker exec airline_postgres psql -U postgres -c "CREATE DATABASE airline_scratch"
docker exec airline_postgres sh -c 'pg_dump -U postgres -d airline_db --no-owner | psql -U postgres -d airline_scratch -q'
npm run build -w apps/backend
cd apps/backend && export DATABASE_URL="postgresql://postgres:<password>@localhost:<port>/airline_scratch"
node -r tsconfig-paths/register dist/src/modules/payments-booking/demo/http-smoke.js   # booking, cargo, onboard, vouchers, miles, refunds
node -r tsconfig-paths/register dist/src/modules/payments-checkout/demo/http-smoke.js
node -r tsconfig-paths/register dist/src/modules/payments-refunds/demo/http-smoke.js
```

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

| Document                                                                     | Purpose                                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`setup.md`](./setup.md)                                                     | Local development setup: prerequisites, install, env config, infra, database commands                         |
| [`docs/infra-guide.md`](./docs/infra-guide.md)                               | Group-facing infrastructure guide: architecture, stack, setup, auth, environment, deployment, and infra rules |
| [`docs/branch-naming-and-workflow.md`](./docs/branch-naming-and-workflow.md) | Branch names, commits, PR flow, reviews, and merge authority                                                  |
| [`docs/backend-structure.md`](./docs/backend-structure.md)                   | Current NestJS structure and backend module boundaries                                                        |
| [`docs/frontend-structure.md`](./docs/frontend-structure.md)                 | Current customer/staff frontend structure and planned feature organization                                    |
| [`docs/database-structure.md`](./docs/database-structure.md)                 | Current Prisma location, migration ownership, naming, and DB workflow                                         |

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
For G10 staff feature testing on a fresh checkout, see [G10 local testing](docs/g10-local-testing.md).
