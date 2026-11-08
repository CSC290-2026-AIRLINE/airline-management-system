# Feature 6 — Check-in, Seat & Boarding (Group 7)

The NestJS module behind the customer check-in, the counter and the gate. Every rule lives in `domain/` (MRZ,
window, baggage, boarding), the three services orchestrate them, and everything another group owns sits behind a
provider interface: a database-backed implementation where the table exists, a fixture where the other group has no
service yet.

The module is registered in `AppModule`, so its routes are served under the global `/api` prefix.

## Routes

`@Controller()` — customer. `@UseGuards(ActorGuard)` resolves the caller. Every route is signed in, the seat map
included: the caller passes the check-in they are picking a seat for in `?checkInId`, and the map then shows that
passenger their own seat and hides the other cabins.

| Method | Path                            | Body / query                          | Service                         |
| ------ | ------------------------------- | ------------------------------------- | ------------------------------- |
| POST   | `/check-ins`                    | `{ pnr, lastName }`                   | `CheckInService.start`          |
| GET    | `/check-ins/:id`                |                                       | `CheckInService.get`            |
| PUT    | `/check-ins/:id/document`       | `{ mrzLine1, mrzLine2, visaNumber? }` | `CheckInService.submitDocument` |
| GET    | `/flights/:flightId/seat-map`   | `?checkInId`                          | `CheckInService.seatMap`        |
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
`NOT_FOUND`, `GATE_CLOSED`, `ON_HOLD`, `CANCELLED` (the check-in was cancelled, so its pass never boards).

The notifications carry feature 13's type codes: `check_in_completed` and `boarding_pass_issued` when the pass is
issued, `gate_changed` when a flight moves to another gate, `boarding_call` when the gate closes.

## Provider seams

One interface per feature we do not own, in `providers/providers.ts`. The database-backed implementations live in
`providers/db-providers.ts`, `providers/db-seats.ts`, `providers/db-payments.ts`, `providers/db-staff-identity.ts`
and `providers/f15-adapters.ts`; the fixtures are in `providers/fixture-providers.ts`. Which of them is bound is
decided by `register('memory' | 'db')` in `checkin-boarding.module.ts` — one line per provider.

| Token            | Interface                  | Owner                            | `db` mode                                                                   | `memory` mode                                                |
| ---------------- | -------------------------- | -------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `CLOCK`          | `ClockProvider`            | F1 simulation clock              | `F15Clock` (feature 15's `SimulationClock`)                                 | `FixtureClock`, starts at `DEMO_NOW`                         |
| `FLIGHTS`        | `FlightProvider`           | F2 flights                       | `DbFlights` (`flight`, `route`, `airport`)                                  | `FixtureFlights` (FY 204, FY 318)                            |
| `BOOKINGS`       | `BookingProvider`          | F3 bookings                      | `DbBookings` (`booking_coupon` and its relations)                           | `FixtureBookings` (14 prototype bookings)                    |
| `PASSENGERS`     | `PassengerProfileProvider` | F7 passenger profile             | `DbPassengers` (`passenger`; fills empty fields only)                       | `FixturePassengers`                                          |
| `SEATS`          | `SeatProvider`             | F3 seat map and holds            | `DbSeats` (`seat_assignment`; the layout stays a fixture)                   | `FixtureSeats` (5 minute hold, `SEAT_TAKEN`, `LOCK_EXPIRED`) |
| `PRICING`        | `PricingProvider`          | F4 baggage and seat fees         | `DbPricing` (`overweight_baggage_rate`, `seat_fee`)                         | `FixturePricing` (20 kg free, 500 THB/kg, max 32 kg)         |
| `PAYMENTS`       | `PaymentProvider`          | F5 payments                      | `DbPayments` (writes the `payment` row itself)                              | `FixturePayments` (fake payment ids)                         |
| `SETTINGS`       | `SettingsProvider`         | F6 settings (`check_in_setting`) | `DbSettings` (`check_in_setting`, `carry_on_allowance`, `visa_requirement`) | `FixtureSettings`                                            |
| `AUDIT`          | `AuditProvider`            | F15 audit log                    | `F15Audit` (writes feature 15's `audit_log`)                                | `LoggerAudit`                                                |
| `SCREENING`      | `ScreeningProvider`        | F7 screening                     | `FixtureScreening`                                                          | `FixtureScreening`                                           |
| `POLICE`         | `PoliceProvider`           | F8 air marshals                  | `FixturePolice`                                                             | `FixturePolice`                                              |
| `TIERS`          | `TierProvider`             | F11 loyalty                      | `FixtureTiers` (nobody has a tier)                                          | `FixtureTiers`                                               |
| `NOTIFY`         | `NotifyProvider`           | F13 notifications                | `LoggerNotify`                                                              | `LoggerNotify`                                               |
| `SENSOR`         | `SensorProvider`           | F16 head-count sensor            | `FixtureSensor` (an override of `null` switches it off)                     | `FixtureSensor`                                              |
| `STAFF_IDENTITY` | `StaffIdentityProvider`    | F1 roles                         | `DbStaffIdentity` (reads `user.type`, see below)                            | `DbStaffIdentity`                                            |

### The fixtures that stay, and what replaces them

- **Screening** (`FixtureScreening`) — feature 7's screening service (`POST /screening/check`: clear or held, and
  later hold and release). Until it lands, the fixture holds a passenger whose passport ends in `0000` **or** whose
  surname is Kowalski (`providers/fixture-providers.ts`: `numberLast4 === HOLD_LAST4 || lastName === 'KOWALSKI'`).
  Dana Kowalski matches both rules.
- **Police** (`FixturePolice`) — feature 8's air-marshal service per flight. The marshal is recognised by his
  passport number (`TH1234567`, Narong Sukjai) in both modes: `DbBookings` reads `passenger.passport_number`, and the
  fixture resolves the passport behind the passenger.
- **Tiers** (`FixtureTiers`) — feature 11's tier lookup. Nobody has a tier, so there is no bag bonus and nobody is
  moved up a boarding group by tier.
- **Notifications** (`LoggerNotify`) — feature 13's notification service. The four type codes are already the ones
  feature 13 uses.
- **Sensor** (`FixtureSensor`) — feature 16's head-count sensor. Without an override it answers the number that
  boarded, so the demo counts by hand.

### The staff guard reads `user.type`

`StaffGuard` asks `STAFF_IDENTITY` who the caller is. `DbStaffIdentity` looks the `user` row up by the id the
token carries and reads `user.type`: a `staff` user is staff and its live `staff` row gives the id the feature 6
tables point at, a `customer` user is not. Roles are **not** enforced yet — feature 1 owns them, so every staff
user passes the guard whatever its role is. The guard is the first line of defence, the services check `staffId`
again. `DbStaffIdentity` is bound in both modes, so the memory mode still reads the database for the caller; the
HTTP spec overrides that one provider with a fake, so no query reaches a database there.
`FixtureStaffIdentity` (every signed-in user is staff) stays in `providers/fixture-providers.ts` for the tests that
want it; it is not bound in the module.

## Persistence

Everything feature 6 writes goes through one contract, so the services never know whether the rows live in memory or
in PostgreSQL.

### The repository contract

`store/checkin-repository.ts` holds the token `CHECKIN_REPOSITORY` and the interface `CheckInRepository`: every
method is asynchronous, the records carry the column names of the migration (`snake_case`), and the eight feature 6
tables it owns are covered — `check_in`, `travel_document`, `checked_bag`, `carry_on_check`, `flight_boarding`,
`boarding_pass`, `boarding_event` and `gate`. The three settings tables (`check_in_setting`,
`carry_on_allowance`, `visa_requirement`) are read by the settings provider, not by the repository. The services
inject the token and nothing else.

### The two implementations

- `store/checkin-store.ts` — `CheckInStore`, maps in the process. It seeds the thirteen demo passes when it is given
  a clock, which is what the memory mode and the demo of the fixtures use.
- `store/prisma-checkin-repository.ts` — `PrismaCheckInRepository`, the real tables, through `DbService` only (never a
  second `PrismaClient`). It sets `updated_at` on every update, soft-deletes a bag with `deleted_at`, takes the bag
  tag number from the `bag_tag_seq` sequence, maps `P2025` (a row that is not there) to a 404, and answers the two
  unique indexes: a second pass for the same check-in returns the pass that is already there, and a second final
  boarding event is written as a rejection with the reason `ALREADY_BOARDED`.

### Which mode runs where

`CheckinBoardingModule.register('memory' | 'db')` picks the repository and the providers.

| Where                                  | Mode         | What it runs                                                                    |
| -------------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| `apps/backend/src/app.module.ts`       | `db`         | the Prisma repository, the database providers, feature 15's clock and audit log |
| `checkin-boarding.http.spec.ts`        | `memory`     | the in-memory store and the fixtures — no database, no Clerk                    |
| the frontends with `VITE_F6_MOCK=true` | browser mock | no backend at all: the frontends' own mock, which mirrors the memory fixtures   |

The browser mock lives in the frontends (`features/checkin-boarding/mock/`), so the two demos differ in the booking
references they know — see "Demo fixtures" below.

### The seed

`npm run db:seed` runs `apps/backend/src/db/seed.ts`, which calls `seedFeature6(prisma)` from
`apps/backend/src/db/seed-f6.ts`. The seed writes the demo network and the demo bookings, and it is idempotent:
every row is looked up on its natural key first, so a second run changes nothing.

- Airports `NRT` and `ICN` (BKK comes from the shared seed), the routes BKK→NRT and BKK→ICN, the aircraft type
  `F6-DEMO-A320` and the two aircraft `HS-F6A` (FY 204) and `HS-F6B` (FY 318) — two tails, because the database
  forbids one aircraft from flying two overlapping departures.
- The fare classes `Y` (economy), `W` (premium economy) and `J` (business) with their baggage rates (20, 25 and
  30 kg free, 500 THB per kg, max 32 kg per bag) and the seat fees of economy and premium economy (front 250, exit
  450).
- The flights FY 204 (gate A1) and FY 318 (gate A2) with their seat inventory and their `flight_boarding` rows. The
  gates themselves, the example visa rules and the `bag_tag_airline_number` setting come from the shared
  `seedCheckIn()`.
- The demo customer, the 14 passengers of the prototype, and for each of them one booking, one segment, one booking
  passenger and one coupon (the coupon carries a ticket number from the database's own sequence).

`F6_DEMO_DEP_AT` (an ISO date, in the environment of the seed) pins the departure of FY 204; FY 318 follows fifteen
minutes later. Without it the departure is the next quarter of an hour at least three hours out, so the check-in
window is open when the demo starts. The variable is read from the environment directly and is not in
`.env.example` yet — the file belongs to the platform.

The seed writes **no** check-ins and no boarding passes: in `db` mode the demo starts with every passenger unchecked
in, and the check-in itself is part of the demonstration.

The demo customer (`f6-demo-customer@flython.example`) has no Clerk id, so it cannot sign in. The demo signs in with
a real Clerk account and finds the booking by PNR and surname; that account's customer row is not the customer of
the seeded booking, so the check-in is held by its UUID (see below).

### The payments until feature 5 has a checkout

Feature 5 exposes no checkout API yet, so feature 6 writes the `payment` row itself: `source_feature = 6`,
`provider = 'fake'`, `status = 'captured'`, `currency = 'THB'`, `amount_total = card_amount = amount`,
`idempotency_key = purchase_ref`, and the booking and its customer taken from the booking. A seat uses the
reference `seat_assignment:<lock id>`, the bags of one check-in `check_in:<check-in id>:bags:<n>`. The rows point
back at the payment: `seat_assignment.payment_id` and `checked_bag.excess_payment_id`. `DbPayments` is idempotent on
`(source_feature, purchase_ref)`, so a retry finds the payment it made the first time.

A seat is charged before it is confirmed, because the migration refuses an assigned seat with a fee and no payment
id. When the confirmation fails, the payment is left behind on purpose and the audit says so
(`seat.payment_orphaned`) — F5 reconciles it when it owns payments.

### What the schema does not carry yet

- **The owner of a check-in.** `check_in` has no owner column. A customer may act on a check-in when the booking's
  `customer.user_id` is theirs, or when the passenger of their own customer row is the check-in's passenger. When
  neither is the case — which is the demo's case, because a Clerk sign-in always creates a fresh customer row — the
  check-in id itself is the key: whoever holds the UUID may read the check-in and continue it. The UUID is the only
  wall between two customers until the database team adds an owner column, or feature 3 links a booking to a Clerk
  customer.
- **The name on the passport.** The schema stores the last four characters of the passport number only, so the staff
  view answers `nameOnPassport: null` and the frontends show "—". The name itself lives on the passenger row of
  feature 7; no column is requested for it here.
- **Special assistance.** Feature 3's `booking_service_request` table carries the codes, but `DbBookings` does not
  read it yet, so `specialAssistance` is empty and boarding group 1 (special assistance) is empty in `db` mode. In
  the memory mode the fixture keeps the prototype's codes (`WCHR` for Somchai Prasert, `UMNR` for Ji-woo Park).
- **The seat layout.** There is no seat-layout table (the layout JSON of `aircraft_type` belongs to feature 9), so
  the 20-row A–F layout stays in `providers/fixtures.ts` (`SEAT_LAYOUT`) and both modes read it. What is persisted is
  `seat_assignment`: `held`, `assigned` or `released`, with `hold_expires_at`, `fee_amount` and `payment_id`. A hold
  that ran out is swept before the next hold is written, because the unique index still counts it.

### One action clears both document flags

`POST /staff/travel-documents/:id/clear-mismatch` clears the name mismatch and the profile differences of a
document in one staff action, and refuses when there is nothing left to clear. A new passport replaces the values of
the document and clears what staff had cleared before.

## Demo fixtures

| What          | Value                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clock         | `db`: feature 15's `SimulationClock` (real time, shiftable). `memory`: `DEMO_NOW` = 2026-11-11T01:00:00.000Z (08:00 Bangkok)                                                                                                       |
| Flights       | FY 204 BKK→NRT gate A1, FY 318 BKK→ICN gate A2. `db`: the seeded departure (next quarter-hour ≥ 3 h out, or `F6_DEMO_DEP_AT`). `memory`: 03:25Z and 03:40Z on 11 Nov                                                               |
| Gates         | A1 and A2, both active at BKK                                                                                                                                                                                                      |
| Bookings      | 14 prototype passengers; Anna Eriksson (`ER224F`) is the demo customer                                                                                                                                                             |
| Passports     | Anna's passenger row carries **no passport number** in either mode, so she types the ICAO specimen MRZ at step 2. `SEEDED_DOC_EXPIRY` (2030-04-15) is the expiry of the seeded documents                                           |
| Seats         | 20 rows, business 1–3, exit row 12, front rows 4–5, the prototype's taken seats                                                                                                                                                    |
| Security hold | a passport whose last four are `0000` **or** the surname Kowalski (`FixtureScreening`); Dana Kowalski matches both rules                                                                                                           |
| Air marshal   | Narong Sukjai, passport `TH1234567`                                                                                                                                                                                                |
| Baggage       | economy 20 kg free (premium economy 25, business 30), 500 THB per kg, max 32 kg per bag, max 158 cm linear                                                                                                                         |
| Carry-on      | 7 kg, 56 × 36 × 23 cm for every cabin                                                                                                                                                                                              |
| Bag tags      | `0` + the airline number + a 6 digit sequence — `999` in `db` mode (from `check_in_setting`), `402` in `memory` mode                                                                                                               |
| Seeded passes | `memory` mode seeds 13 check-ins, each with a boarding pass — every booking but Anna. Twelve of them are `checked_in`; **Dana Kowalski's on-hold check-in is the thirteenth**, so it is counted among the 13. `db` mode seeds none |

The booking references are the ones of `providers/demo-data.ts`: Anna is `ER224F`, Narong is `PL224A`, and so on. The
`booking_reference` CHECK of the database allows only `A-H`, `J-N`, `P-Z` and `2-9`, so every `0` of the prototype
became a `2` and every `1` a `3` — the customer-web and staff-web browser mocks still carry the prototype's
references (`ER204F`, `PL204A`), so the mock demo and the database demo use different references for the same
passengers.

## Tests

```bash
npm run test -w apps/backend            # every spec
npm run test -w apps/backend -- http   # the HTTP smoke test of the routes
```

`checkin-boarding.http.spec.ts` builds the Nest application from this module alone in `memory` mode — no database, no
Clerk — and signs a user in with an `x-test-user` header. The database-backed classes are unit-tested against
hand-written fake `db` objects (`store/prisma-checkin-repository.spec.ts`, `providers/db-providers.spec.ts`,
`providers/db-seats.spec.ts`, `providers/db-payments.spec.ts`, `providers/f15-adapters.spec.ts`,
`providers/db-staff-identity.spec.ts`, `providers/demo-data.spec.ts`); what they do against a real PostgreSQL is
shown by the demo script.

## Known gaps (as of 2026-11-08)

- **Staff roles** are not enforced: `DbStaffIdentity` only reads `user.type`. Feature 1's roles decide who may do what.
- **F3 seat API**: the seat map, the 5-minute hold, confirm and release are ours. `DbSeats` writes the holds into
  `seat_assignment` and reads the layout from the fixture; replace the provider with G13's contract when it exists.
  Feature 3's special-assistance codes are not read yet either, so boarding group 1 is empty in `db` mode.
- **F11 tier**: `FixtureTiers` returns none, so nobody gets the tier bag bonus or boarding group 2/3 by tier.
- **F5 checkout**: `DbPayments` writes the `payment` row itself, with `provider = 'fake'`. When feature 5 exposes a
  checkout, that provider is the one file to replace.
- **`nameOnPassport` is not stored**: the schema keeps only the last four characters of the passport number, so the
  staff view answers `null` and the frontends show "—".
- **The customer access shortcut**: without an owner column on `check_in`, a customer who holds the check-in UUID may
  act on it. The UUID is the only wall between two customers until the database team adds an owner column or feature 3
  links a booking to a Clerk customer.
- **The seat hold and the seat payment id live in the process**: the hold row is written to `seat_assignment`, but the
  service keeps the lock and the payment id in a map, so a hold made before a restart cannot be confirmed after it (it
  runs out by itself within five minutes) and a restarted process shows no payment id on the seat.
- **The counter's seat and bag columns show "—"**: the search rows carry neither a seat nor a bag count; the passenger
  panel shows both. The backend row needs the two values before the columns can be filled.
- **OCR** (`POST /check-ins/:id/document/ocr`) is not implemented (stretch goal).
- **QR**: the boarding pass shows the reference and a pseudo-QR drawn from it; a real QR encoder is a dependency decision for the team.
- **Nest-generated 404/400/401 bodies** (unknown route, malformed JSON, missing token) do not use the `{ error }`
  envelope; a global exception filter in `main.ts` is the platform's call (raised with the Dev leads). The frontends
  map these to code `UNKNOWN`.
- **LoggerNotify writes with `logger.log`**, which `main.ts`'s logger levels (`error`, `warn`) hide. The audit is a
  real feature 15 row in `db` mode; only the memory mode still logs it.
