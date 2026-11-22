# Booking hold integration checks

Run from the repository root, with Node 24 and the local Docker PostgreSQL service running:

```powershell
npm run build -w apps/backend
node apps/backend/src/modules/booking-pnr/hold/hold.integration.cjs
```

The script uses the default local PostgreSQL credentials from `docker-compose.yml`. It creates a uniquely named temporary database, copies Feature 3's inventory/booking constraints from its migration, and creates external fixture tables from the scalar fields in the current Prisma models. It removes the test database when finished and never reads environment files or modifies the development database.

The HTTP harness uses the real JWT guard with synthetic identities and an ephemeral test signing key. It tests the real hold controller, DTO validation, hold service, inventory service and PostgreSQL transactions. Pricing uses an inline USD 148.50 test double. Seat and assistance ports remain test doubles; a deliberately failing seat port checks rollback.

A booking accepts only the customer's own passenger (`customer.passenger_id`) or a traveller saved to them (`customer_passenger`); any other passenger id is answered 422 with nothing held, for customer and staff bookings alike.

Checks cover the last-seat race, passenger ownership, concurrent idempotent retries, customer-scoped keys, price changes, full 15-minute expiry, multi-leg rollback, infant pricing/lap links, booking-reference collision retries, and malformed requests. Individual seat rules, real authentication, payment and miles remain outside these checks.

Staff booking (`POST /api/staff/bookings`) uses the same hold transaction. The JWT subject must resolve to a live staff record whose user is neither deleted nor disabled; the target customer must also be active. The body supplies `customerId` but cannot supply `bookedByStaffId`. Until the platform provides its shared staff-only guard, these membership checks stay inside `HoldService.createForStaff`. Role-specific staff permissions remain a platform integration item.

It also runs the real `ConfirmService` and `ReleaseService` against PostgreSQL: a late payment on an expired booking takes its seats again before selling them (or refunds with `HOLD_EXPIRED_REFUNDED` when they are gone, leaving other holds intact), and the expiry job releases each stale hold in its own transaction, so one broken hold cannot stop the rest.

The integration script also checks customer-token rejection, forged actor fields, disabled staff/customers, correct `booked_by_staff_id`, and idempotent staff retries using the real JWT guard.
