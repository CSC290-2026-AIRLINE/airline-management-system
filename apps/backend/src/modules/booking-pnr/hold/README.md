# Booking hold integration checks

Run from the repository root, with Node 24 and the local Docker PostgreSQL service running:

```powershell
npm run build -w apps/backend
node apps/backend/src/modules/booking-pnr/hold/hold.integration.cjs
```

The script uses the default local PostgreSQL credentials from `docker-compose.yml`. It creates a uniquely named temporary database, copies Feature 3's inventory/booking constraints from its migration, and creates external fixture tables from the scalar fields in the current Prisma models. It removes the test database when finished and never reads environment files or modifies the development database.

The HTTP harness uses the real JWT guard with synthetic identities and an ephemeral test signing key. It also verifies that the demo-passenger endpoint requires authentication and returns 404 outside development. It tests the real hold controller, DTO validation, hold service, inventory service and PostgreSQL transactions. Pricing uses the existing USD 148.50 stub. Seat and assistance ports remain test doubles; a deliberately failing seat port checks rollback.

Checks cover the last-seat race, concurrent idempotent retries, customer-scoped keys, price changes, full 15-minute expiry, multi-leg rollback, infant pricing/lap links, booking-reference collision retries, and malformed requests. Individual seat rules, real authentication, payment and miles remain outside these checks.
