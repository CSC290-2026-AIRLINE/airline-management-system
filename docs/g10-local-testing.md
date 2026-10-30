# G10: Test a Fresh Local Checkout

Run all commands from the repository root with Node.js 24 and Docker Desktop running. These instructions use the existing authentication and database setup; they do not bypass authorization.

## Configure and prepare

Obtain the approved local environment configuration from Infra for the backend and staff-web. Follow [setup.md](../setup.md) to create the local environment files. Do not commit or share credentials. Each tester uses their own local database; cloning a branch does not copy another developer's records.

```bash
npm ci
npm run db:up
npm run db:prepare
npm run db:seed:security
```

`db:prepare` applies committed migrations and generates Prisma Client. It does not reset the database or create migrations. Wait for PostgreSQL to be ready and retry if it is still starting. Missing-field TypeScript errors involving `gender`, `name_similarity`, or `revision` can indicate an outdated Prisma Client. Run `npm run db:generate` after pulling schema changes. Backend `start:dev`, `build`, and `test` also generate the client automatically; generation requires the existing backend environment configuration but does not require a database connection.

The security seed creates the `security` reference role if missing. It preserves existing data, refuses production or non-loopback database hosts, and does not run the shared database seed.

## Start the applications

Use separate terminals:

```bash
npm run start:dev -w apps/backend
```

```bash
npm run dev -w apps/staff-web
```

Open http://localhost:6161 and sign in using an approved staff Clerk account. An existing Clerk session redirects `/` to `/customer-search`; a signed-out visitor is sent to `/login`.

## Assign your test staff account

After the first successful staff sign-in has created the staff record, run:

```bash
npm run db:seed:security -- --email YOUR_STAFF_EMAIL
```

Replace `YOUR_STAFF_EMAIL` with your own staff sign-in email. No email is hardcoded in the script. Assignment requires exactly one enabled Clerk-linked staff record. If it fails, confirm that the backend sign-in exchange succeeded and that the account is a staff account. The seed does not create a Clerk account or staff record.

Sign out and sign in again, then open:

- http://localhost:6161/security-screening/watchlist
- http://localhost:6161/security-screening/screening-queue

The `security` role belongs to the application database, not Clerk. An admin role alone does not grant access to these APIs. A 401 indicates missing or expired authentication; a 403 indicates insufficient access or an unavailable staff account. Keep the existing guards enabled.

## Verify persisted data

Create a synthetic entry using **Add entry** on Watchlist, then reload the page. Open Prisma Studio in another terminal:

```bash
npm run db:studio
```

Use the URL printed by Studio. Find the entry in `watchlist_entry`. Changes made through the API also create audit records. Use fictional identities only. Test records remain in the local database and are not included in Git commits or pushes.

An empty successful list response means no matching records exist. A failed API request is not evidence of an empty database; check the backend terminal and browser Network panel first.

Screening Queue is populated by screening checks associated with passengers and flights, not by adding Watchlist records alone. Use the documented screening integration or coordinated test fixtures; do not manually invent incomplete relationships in Prisma Studio. See [Screening documentation](../apps/backend/src/modules/screening/README.md) and [Watchlist API testing](../apps/backend/src/modules/watchlist/TESTING.md).
