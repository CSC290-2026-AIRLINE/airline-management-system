# Feature 6 — Check-in, Seat & Boarding (Group 7)

The NestJS module behind the customer check-in, the counter and the gate. Every rule lives in `domain/`
(MRZ, window, baggage, boarding), the three services orchestrate them and everything another group owns sits
behind a provider interface with an in-memory fixture.

The module is registered in `AppModule`, so its routes are served under the global `/api` prefix.

## Routes

`@Controller()` — customer. `@UseGuards(ActorGuard)` resolves the caller. Every route is signed in, the seat map
included: it needs the caller to show them their own seat.

| Method | Path                            | Body / query                          | Service                         |
| ------ | ------------------------------- | ------------------------------------- | ------------------------------- |
| POST   | `/check-ins`                    | `{ pnr, lastName }`                   | `CheckInService.start`          |
| GET    | `/check-ins/:id`                |                                       | `CheckInService.get`            |
| PUT    | `/check-ins/:id/document`       | `{ mrzLine1, mrzLine2, visaNumber? }` | `CheckInService.submitDocument` |
| GET    | `/flights/:flightId/seat-map`   |                                       | `CheckInService.seatMap`        |
| POST   | `/flights/:flightId/seat-locks` | `{ checkInId, seatCode }`             | `CheckInService.holdSeat`       |
| DELETE | `/seat-locks/:id`               |                                       | `CheckInService.releaseSeat`    |
| PUT    | `/check-ins/:id/seat`           | `{ lockId }`                          | `CheckInService.confirmSeat`    |
| PUT    | `/check-ins/:id/baggage`        | `{ declaredBags }`                    | `CheckInService.declareBags`    |
| POST   | `/check-ins/:id/complete`       |                                       | `CheckInService.complete`       |
| GET    | `/check-ins/:id/boarding-pass`  |                                       | `CheckInService.boardingPass`   |

`@Controller('staff')` — `@UseGuards(StaffGuard)`, a customer token gets `403 FORBIDDEN`.

| Method | Path                                                | Body / query                                            | Service                                            |
| ------ | --------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| GET    | `/staff/check-ins`                                  | `?flightId&pnr&name`                                    | `CounterService.search`                            |
| GET    | `/staff/check-ins/:id`                              |                                                         | `CounterService.detail`                            |
| POST   | `/staff/check-ins/:id/bags`                         | `{ weightKg, lengthCm, widthCm, heightCm }`             | `CounterService.weighBag`                          |
| DELETE | `/staff/bags/:id`                                   |                                                         | `CounterService.removeBag`                         |
| POST   | `/staff/bags/:id/tag`                               |                                                         | `CounterService.tagBag` (charges the excess first) |
| GET    | `/staff/bags/:tagNumber`                            |                                                         | `CounterService.bagByTag` (for feature 10)         |
| GET    | `/staff/flights/:flightId/bags`                     |                                                         | `CounterService.bagsByFlight` (for feature 10)     |
| PUT    | `/staff/check-ins/:id/carry-on`                     | `{ weightKg, lengthCm, widthCm, heightCm }`             | `CounterService.carryOn`                           |
| POST   | `/staff/travel-documents/:id/clear-mismatch`        |                                                         | `CounterService.clearMismatch`                     |
| POST   | `/staff/travel-documents/:id/check-visa`            |                                                         | `CounterService.checkVisa`                         |
| POST   | `/staff/boarding-passes/:id/print`                  |                                                         | `CounterService.printPass`                         |
| GET    | `/staff/gates`                                      |                                                         | `GateService.gates`                                |
| GET    | `/staff/flights`                                    |                                                         | `GateService.flights`                              |
| PUT    | `/staff/flights/:flightId/gate`                     | `{ gateId }`                                            | `GateService.setGate`                              |
| GET    | `/staff/gates/:gateId/flights/:flightId/passengers` |                                                         | `GateService.passengerList`                        |
| POST   | `/staff/gates/:gateId/scans`                        | `{ flightId, reference }`                               | `GateService.scan`                                 |
| GET    | `/staff/flights/:flightId/headcount`                |                                                         | `GateService.headcount`                            |
| PUT    | `/staff/flights/:flightId/headcount`                | `{ source: 'sensor' }` or `{ source: 'manual', count }` | `GateService.setHeadcount`                         |
| POST   | `/staff/flights/:flightId/close-gate`               | `{ confirmMismatch? }`                                  | `GateService.closeGate`                            |

Every failure is `{ error: { code, message, details? } }`. The codes are closed: `VALIDATION`, `NOT_FOUND`,
`FORBIDDEN`, `WINDOW_CLOSED`, `NOT_ELIGIBLE`, `MRZ_INVALID`, `PASSPORT_EXPIRING`, `VISA_REQUIRED`,
`DUPLICATE_DOCUMENT`, `ON_HOLD`, `SEAT_TAKEN`, `LOCK_EXPIRED`, `EXCESS_UNPAID`, `BAG_REFUSED`, `INVALID_STATE`,
`HEADCOUNT_MISMATCH`. The scan rejects are not HTTP errors: `WRONG_GATE`, `WRONG_FLIGHT`, `ALREADY_BOARDED`,
`NOT_FOUND`, `GATE_CLOSED`, `ON_HOLD`.

## Provider seams

One interface per feature we do not own, in `providers/providers.ts`. The fixture implementations are in
`providers/fixture-providers.ts`; swapping in the real module is one line in `checkin-boarding.module.ts`.

| Token            | Interface                  | Owner                            | Fixture today                                                 |
| ---------------- | -------------------------- | -------------------------------- | ------------------------------------------------------------- |
| `CLOCK`          | `ClockProvider`            | F1 simulation clock              | `FixtureClock`, starts at `DEMO_NOW`                          |
| `FLIGHTS`        | `FlightProvider`           | F2 flights                       | `FixtureFlights` (FY 204, FY 318)                             |
| `BOOKINGS`       | `BookingProvider`          | F3 bookings                      | `FixtureBookings` (14 prototype bookings)                     |
| `PASSENGERS`     | `PassengerProfileProvider` | F7 passenger profile             | `FixturePassengers` (fills empty fields only)                 |
| `SEATS`          | `SeatProvider`             | F3 seat map and holds            | `FixtureSeats` (5 minute hold, `SEAT_TAKEN`, `LOCK_EXPIRED`)  |
| `PRICING`        | `PricingProvider`          | F4 baggage and seat fees         | `FixturePricing` (20 kg free, 500 THB/kg, max 32 kg)          |
| `PAYMENTS`       | `PaymentProvider`          | F5 payments                      | `FixturePayments` (fake payment ids)                          |
| `SCREENING`      | `ScreeningProvider`        | F7 screening                     | `FixtureScreening` (holds on the demo passport)               |
| `POLICE`         | `PoliceProvider`           | F8 air marshals                  | `FixturePolice`                                               |
| `TIERS`          | `TierProvider`             | F11 loyalty                      | `FixtureTiers` (nobody has a tier)                            |
| `NOTIFY`         | `NotifyProvider`           | F13 notifications                | `LoggerNotify`                                                |
| `AUDIT`          | `AuditProvider`            | F15 audit log                    | `LoggerAudit` (never writes an MRZ line or a passport number) |
| `SENSOR`         | `SensorProvider`           | F16 head-count sensor            | `FixtureSensor` (an override of `null` switches it off)       |
| `STAFF_IDENTITY` | `StaffIdentityProvider`    | F1 roles                         | `DbStaffIdentity` (reads `user.type`, see below)              |
| `SETTINGS`       | `SettingsProvider`         | F6 settings (`check_in_setting`) | `FixtureSettings`                                             |

### The staff guard reads `user.type`

`StaffGuard` asks `STAFF_IDENTITY` who the caller is. `DbStaffIdentity` looks the `user` row up by the id the
token carries and reads `user.type`: a `staff` user is staff and its live `staff` row gives the id the feature 6
tables point at, a `customer` user is not. Roles are **not** enforced yet — feature 1 owns them, so every staff
user passes the guard whatever its role is. The guard is the first line of defence, the services check `staffId`
again. `FixtureStaffIdentity` (every signed-in user is staff) stays in `providers/fixture-providers.ts` for the
demo and the tests; it is no longer bound in the module.

## Demo fixtures

| What          | Value                                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| Clock         | `DEMO_NOW` = 2026-11-11T01:00:00.000Z (08:00 Bangkok)                                 |
| Flights       | FY 204 BKK→NRT 10:25 gate A1, FY 318 BKK→ICN 10:40 gate A2                            |
| Gates         | A1 (`gate-a1`), A2 (`gate-a2`), both active at BKK                                    |
| Bookings      | 14 prototype passengers; Anna Eriksson (`ER204F`) is the customer with no seeded pass |
| Passports     | the ICAO specimen passport for Anna, `SEEDED_DOC_EXPIRY` for the seeded ones          |
| Seats         | 20 rows, business 1–3, exit row 12, front rows 4–5, the prototype's taken seats       |
| Security hold | a passport whose last four are `0000`, or the surname Kowalski                        |
| Baggage       | economy 20 kg free, 500 THB per kg, max 32 kg per bag, max 158 cm linear              |
| Carry-on      | 7 kg, 56 × 36 × 23 cm                                                                 |
| Bag tags      | `0` + airline number `402` + a 6 digit sequence                                       |

## Moving to Prisma

The feature 6 tables are not in the repo yet: the migration PR belongs to the database team. Until it lands,
`store/checkin-store.ts` is an in-memory stand-in whose records use the **column names of the migration**
(`check_in`, `travel_document`, `checked_bag`, `carry_on_check`, `flight_boarding`, `boarding_pass`,
`boarding_event`, `gate`). Moving over is a change of that one file:

1. Implement the same methods on a `PrismaCheckInStore` that uses `DbService` (never a new `PrismaClient`).
2. Replace `CheckInStore` in `checkin-boarding.module.ts` with that class.
3. The services, the domain rules, the controllers and the frontends do not change.

Never edit `schema.prisma` or the migrations from this feature.

## Tests

```bash
npm run test -w apps/backend            # every spec
npm run test -w apps/backend -- http   # the HTTP smoke test of the routes
```

`checkin-boarding.http.spec.ts` builds the Nest application from this module alone — no database, no Clerk — and
signs a user in with an `x-test-user` header.

## Known gaps (as of 2026-10-27)

- **Staff roles** are not enforced: `DbStaffIdentity` only reads `user.type`. Feature 1's roles decide who may do what.
- **F3 seat API**: `FixtureSeats` fakes the map, 5-minute holds, confirm and release. Replace with G13's contract when it exists.
- **F11 tier**: `FixtureTiers` returns none, so nobody gets the tier bag bonus or boarding group 2/3 by tier.
- **Seat payment id** lives in `CheckInService` memory; the F6 migration has no column for it (raise with the DB team).
- **OCR** (`POST /check-ins/:id/document/ocr`) is not implemented (stretch goal).
- **QR**: the boarding pass shows the reference and a pseudo-QR drawn from it; a real QR encoder is a dependency decision for the team.
- **Persistence**: everything is in `CheckInStore` (memory) until Freddie's F6 migration lands; see "Moving to Prisma".
- **Nest-generated 404/400/401 bodies** (unknown route, malformed JSON, missing token) do not use the `{ error }`
  envelope; a global exception filter in `main.ts` is the platform's call (raised with the Dev leads). The frontends
  map these to code `UNKNOWN`.
- **LoggerAudit/LoggerNotify write with `logger.log`**, which `main.ts`'s logger levels (`error`, `warn`) hide.
