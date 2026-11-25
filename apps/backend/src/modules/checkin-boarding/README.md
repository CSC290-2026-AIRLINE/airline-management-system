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
| POST   | `/check-ins`                    | `{ pnr, lastName, firstName? }`       | `CheckInService.start`          |
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

| Method | Path                                                | Body / query                                            | Service                                                                     |
| ------ | --------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/staff/check-ins`                                  | `?flightId&pnr&name`                                    | `CounterService.search`                                                     |
| POST   | `/staff/check-ins`                                  | `{ bookingPassengerId, flightId }`                      | `CounterService.start` (a booked passenger who has not started)             |
| GET    | `/staff/check-ins/:id`                              |                                                         | `CounterService.detail`                                                     |
| POST   | `/staff/check-ins/:id/bags`                         | `{ weightKg, lengthCm, widthCm, heightCm }`             | `CounterService.weighBag`                                                   |
| DELETE | `/staff/bags/:id`                                   |                                                         | `CounterService.removeBag`                                                  |
| POST   | `/staff/check-ins/:id/bags/pay`                     |                                                         | `CounterService.payExcess` (all unpaid excess, one payment)                 |
| POST   | `/staff/bags/:id/tag`                               |                                                         | `CounterService.tagBag` (`EXCESS_UNPAID` until paid)                        |
| GET    | `/staff/bags/:tagNumber`                            |                                                         | `CounterService.bagByTag` (for feature 10)                                  |
| GET    | `/staff/flights/:flightId/bags`                     |                                                         | `CounterService.bagsByFlight` (for feature 10)                              |
| PUT    | `/staff/check-ins/:id/carry-on`                     | `{ weightKg, lengthCm, widthCm, heightCm }`             | `CounterService.carryOn`                                                    |
| POST   | `/staff/travel-documents/:id/clear-mismatch`        |                                                         | `CounterService.clearMismatch`                                              |
| POST   | `/staff/travel-documents/:id/check-visa`            |                                                         | `CounterService.checkVisa`                                                  |
| POST   | `/staff/boarding-passes/:id/print`                  |                                                         | `CounterService.printPass`                                                  |
| GET    | `/staff/gates`                                      | `?airport&all`                                          | `GateService.gates`                                                         |
| GET    | `/staff/gates/counts`                               |                                                         | `GateService.gateCounts`                                                    |
| POST   | `/staff/airports/:airportCode/gates`                | `{ codes }`                                             | `GateService.addGates`                                                      |
| PATCH  | `/staff/gates/:gateId`                              | `{ isActive }`                                          | `GateService.setGateActive`                                                 |
| GET    | `/staff/flights`                                    |                                                         | `GateService.flights`                                                       |
| PUT    | `/staff/flights/:flightId/gate`                     | `{ gateId }`                                            | `GateService.setGate` (409 `GATE_INACTIVE`, 409 `GATE_TAKEN`, `VALIDATION`) |
| GET    | `/staff/gates/:gateId/flights/:flightId/passengers` |                                                         | `GateService.passengerList`                                                 |
| POST   | `/staff/gates/:gateId/scans`                        | `{ flightId, reference }`                               | `GateService.scan`                                                          |
| GET    | `/staff/flights/:flightId/headcount`                |                                                         | `GateService.headcount`                                                     |
| PUT    | `/staff/flights/:flightId/headcount`                | `{ source: 'sensor' }` or `{ source: 'manual', count }` | `GateService.setHeadcount`                                                  |
| POST   | `/staff/flights/:flightId/close-gate`               | `{ confirmMismatch? }`                                  | `GateService.closeGate`                                                     |

Every failure is `{ error: { code, message, details? } }`. The codes are closed: `VALIDATION`, `NOT_FOUND`,
`FORBIDDEN`, `WINDOW_CLOSED`, `NOT_ELIGIBLE`, `MRZ_INVALID`, `PASSPORT_EXPIRING`, `VISA_REQUIRED`,
`DUPLICATE_DOCUMENT`, `ON_HOLD`, `SEAT_TAKEN`, `LOCK_EXPIRED`, `EXCESS_UNPAID`, `BAG_REFUSED`, `INVALID_STATE`,
`HEADCOUNT_MISMATCH`, `INVALID_GATE_CODE`, `GATE_EXISTS`, `GATE_IN_USE`, `GATE_TAKEN`, `GATE_INACTIVE`. The scan
rejects are not HTTP errors: `WRONG_GATE`, `WRONG_FLIGHT`, `ALREADY_BOARDED`, `NOT_FOUND`, `GATE_CLOSED`, `ON_HOLD`,
`CANCELLED` (the check-in was cancelled, so its pass never boards).

### The gates of an airport

Every airport has its own gates: `GET /staff/gates?airport=BKK` lists the turned-on ones (number-aware, A2 before
A10) with the flight that boards there now, `all=true` adds the turned-off ones; the airport is required. `GET
/staff/gates/counts` answers one row per airport with the number of its turned-on gates, an airport without gates
counted as zero. `POST /staff/airports/BKK/gates`
adds up to 30 codes (`^[A-Z0-9]{1,4}$`); the codes that are already there come back as `skipped`, a bad code is
`INVALID_GATE_CODE` and nothing is added, a request of codes that are all there is `GATE_EXISTS`. `PATCH
/staff/gates/:gateId` turns a gate on or off; a gate with a flight on it stays on (`GATE_IN_USE`). Gates are never
deleted.

`PUT /staff/flights/:flightId/gate` moves a flight to a gate: a turned-off gate is refused with 409
`GATE_INACTIVE`, a gate another open flight uses with 409 `GATE_TAKEN`, and a gate at another airport than the one
the flight departs from with `VALIDATION`. A cancelled or departed flight never gets its first gate: it is refused
with 409 `INVALID_STATE` and nothing is written.

The notifications carry feature 13's type codes: `check_in_completed` and `boarding_pass_issued` when the pass is
issued, `gate_changed` when a flight moves to another gate, `boarding_call` when the gate closes.

### The screens in the admin console

Feature 15 keeps the registry of screens a role may hold. On boot, in `db` mode, the module registers its three staff
pages there — `f06.counter`, `f06.issues` and `f06.gate` (`checkin-boarding.screens.ts`) — so they show up as tickable
rows under "CHECK-IN" in Role access. The codes are the ones staff-web asks for in `CHECKIN_ITEMS`. `memory` mode has no
database and registers nothing.

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
| `SEATS`          | `SeatProvider`             | F3 seat map and holds            | `DbSeats` (`seat_assignment`; seats from the aircraft's layout)             | `FixtureSeats` (5 minute hold, `SEAT_TAKEN`, `LOCK_EXPIRED`) |
| `PRICING`        | `PricingProvider`          | F4 baggage and seat fees         | `DbPricing` (`overweight_baggage_rate`, `seat_fee`)                         | `FixturePricing` (20 kg free, 500 THB/kg, max 32 kg)         |
| `PAYMENTS`       | `PaymentProvider`          | F5 payments                      | `DbPayments` (writes the `payment` row itself)                              | `FixturePayments` (fake payment ids)                         |
| `SETTINGS`       | `SettingsProvider`         | F6 settings (`check_in_setting`) | `DbSettings` (`check_in_setting`, `carry_on_allowance`, `visa_requirement`) | `FixtureSettings`                                            |
| `AUDIT`          | `AuditProvider`            | F15 audit log                    | `F15Audit` (writes feature 15's `audit_log`)                                | `LoggerAudit`                                                |
| `SCREENING`      | `ScreeningProvider`        | F7 screening                     | `F7Screening` (feature 7's `ScreeningCheckService.checkSystem`)             | `FixtureScreening`                                           |
| `POLICE`         | `PoliceProvider`           | F8 air marshals                  | `FixturePolice`                                                             | `FixturePolice`                                              |
| `TIERS`          | `TierProvider`             | F11 loyalty                      | `FixtureTiers` (nobody has a tier)                                          | `FixtureTiers`                                               |
| `NOTIFY`         | `NotifyProvider`           | F13 notifications                | `LoggerNotify`                                                              | `LoggerNotify`                                               |
| `SENSOR`         | `SensorProvider`           | F16 head-count sensor            | `FixtureSensor` (an override of `null` switches it off)                     | `FixtureSensor`                                              |
| `STAFF_IDENTITY` | `StaffIdentityProvider`    | F1 roles                         | `DbStaffIdentity` (reads `user.type`, see below)                            | `DbStaffIdentity`                                            |

### The fixtures that stay, and what replaces them

- **Screening** — in `db` mode, `F7Screening` calls feature 7's `checkSystem('checkin_boarding', …)` with the trigger
  `check_in` at the passport step. Feature 7's `denied` is held like `held`, and when screening cannot run feature 7
  answers `held` with no run id; `F7Screening` gives it a fresh one, since an on-hold check-in needs one. A passenger is
  never cleared without a check. The `memory` mode keeps
  `FixtureScreening`, which holds a passport ending in `0000` **or** the surname Kowalski; Dana Kowalski matches both.
- **Releasing a hold** — feature 7 does not call feature 6 back, so `CheckInService.refreshHold` asks it
  (`statusSystem`) whenever a held check-in is read: by the customer, or by the counter when the agent opens the
  passenger. Released by security → `started` again; confirmed → `denied`. A passenger held because screening could
  not run has no screening on record (`not_screened`) and is screened again there. The `memory` fixture keeps every
  hold.
- **Police** (`FixturePolice`) — feature 8's air-marshal service per flight. The marshal is recognised by his
  passport number (`TH1234567`, Narong Sukjai) in both modes: `DbBookings` reads `passenger.passport_number`, and the
  fixture resolves the passport behind the passenger. The boarding group reads `booking.isPolice` as well, so the
  marshal boards first even when the police service knows nothing about the flight.
- **Tiers** (`FixtureTiers`) — feature 11's tier lookup. Nobody has a tier, so there is no bag bonus and nobody is
  moved up a boarding group by tier.
- **Notifications** (`LoggerNotify`) — feature 13's notification service. The four type codes are already the ones
  feature 13 uses.
- **Sensor** (`FixtureSensor`) — the automatic head count. Feature 16 will not build a gate sensor (G14's scope is a
  standalone robot, Dev team 2026-11-12), so this fixture stays: without an override it answers the number that
  boarded, and the agent's typed count is the real path.

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

| Where                            | Mode     | What it runs                                                                    |
| -------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `apps/backend/src/app.module.ts` | `db`     | the Prisma repository, the database providers, feature 15's clock and audit log |
| `checkin-boarding.http.spec.ts`  | `memory` | the in-memory store and the fixtures — no database, no Clerk                    |

### The seed

`npm run db:seed` runs `apps/backend/src/db/seed.ts`, whose Feature 6 section (`seedFeature6`) writes this data. The seed writes the demo network and the demo bookings, and it is idempotent:
every row is looked up on its natural key first, so a second run changes nothing.

- Airports `NRT` and `ICN` (BKK comes from the shared seed), the routes BKK→NRT and BKK→ICN, the aircraft type
  `F6-DEMO-A320-V2` and the two aircraft `HS-F6A` (FY 204) and `HS-F6B` (FY 318) — two tails, because the database
  forbids one aircraft from flying two overlapping departures.
- The fare classes `Y` (economy), `W` (premium economy) and `J` (business) with their baggage rates (20, 25 and
  30 kg free, 500 THB per kg, max 32 kg per bag) and the seat fees of economy and premium economy (front 250, exit
  450).
- The flights FY 204 (gate A1) and FY 318 (gate A2) with their seat inventory and their `flight_boarding` rows. The
  gates themselves, the example visa rules and the `bag_tag_airline_number` setting come from the shared
  `seedCheckIn()`.
- The demo customer, the 14 passengers of the prototype, and for each of them one booking, one segment, one booking
  passenger and one coupon (the coupon carries a ticket number from the database's own sequence). The special
  assistance of the prototype (`WCHR` for Somchai Prasert, `UMNR` for Ji-woo Park) is written as the live
  `booking_service_request` rows of feature 3.

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

- **The owner of a check-in.** `check_in` has no owner column, so the booking's customer stands in. A customer may act
  on a check-in (and give its seat hold back) only when the booking's `customer.user_id` is theirs; anyone else gets a 404. A booking whose customer has no Clerk account — the seed's demo customer, which nobody can sign in as — has no
  owner anyone could match, so for it the check-in id itself is the key: whoever holds the UUID may continue it. That is
  the demo's case until the database team adds an owner column, or feature 3 links a booking to a signed-in customer.
- **The name on the passport.** The schema stores the last four characters of the passport number only, so the staff
  view answers `nameOnPassport: null` and the frontends show "—". The name itself lives on the passenger row of
  feature 7; no column is requested for it here.
- **The seat layout.** There is no seat table: `DbSeats` builds the seats of a flight from `aircraft_type.layout`
  (`domain/seat-list.ts`). Feature 9's `cabins` format is read as it is; a plain grid (`rows` + `seats_per_row`, the
  aircraft of the shared seed) is split front to back by the flight's `seat_inventory`. The in-memory mode uses the
  demo aircraft (`DEMO_LAYOUT`). What is persisted is `seat_assignment`: `held`, `assigned` or `released`, with
  `hold_expires_at`, `fee_amount` and `payment_id`. A hold that ran out is swept before the next hold is written,
  because the unique index still counts it.

### Special assistance

The codes come from feature 3: `DbBookings` reads the live `booking_service_request` rows of the passenger (`requested`
or `accepted`), so `specialAssistance` is filled in `db` mode and boarding group 1 works there as well. The memory mode
keeps the prototype's codes (`WCHR` for Somchai Prasert, `UMNR` for Ji-woo Park) and the seed writes the same codes
into the table.

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
| Security hold | a passport whose last four are `0000` **or** the surname Kowalski (`FixtureScreening`, `memory` mode); `db` mode asks feature 7's watchlist                                                                                        |
| Air marshal   | Narong Sukjai, passport `TH1234567`                                                                                                                                                                                                |
| Baggage       | economy 20 kg free (premium economy 25, business 30), 500 THB per kg, max 32 kg per bag, max 158 cm linear                                                                                                                         |
| Carry-on      | 7 kg, 56 × 36 × 23 cm for every cabin                                                                                                                                                                                              |
| Bag tags      | `0` + the airline number + a 6 digit sequence — `999` in `db` mode (from `check_in_setting`), `402` in `memory` mode                                                                                                               |
| Seeded passes | `memory` mode seeds 13 check-ins, each with a boarding pass — every booking but Anna. Twelve of them are `checked_in`; **Dana Kowalski's on-hold check-in is the thirteenth**, so it is counted among the 13. `db` mode seeds none |

The booking references are the ones of `providers/demo-data.ts`: Anna is `ER224F`, Narong is `PL224A`, and so on. The
`booking_reference` CHECK of the database allows only `A-H`, `J-N`, `P-Z` and `2-9`, so every `0` of the prototype
became a `2` and every `1` a `3`.

## Tests

```bash
npm run test -w apps/backend            # every spec
npm run test -w apps/backend -- http   # the HTTP smoke test of the routes
```

`checkin-boarding.http.spec.ts` builds the Nest application from this module alone in `memory` mode — no database, no
Clerk — and signs a user in with an `x-test-user` header. `checkin-boarding.module.spec.ts` covers the screen
registration and the two modes of the module. The database-backed classes are unit-tested against
hand-written fake `db` objects (`store/prisma-checkin-repository.spec.ts`, `providers/db-providers.spec.ts`,
`providers/db-seats.spec.ts`, `providers/db-payments.spec.ts`, `providers/f15-adapters.spec.ts`,
`providers/db-staff-identity.spec.ts`, `providers/demo-data.spec.ts`); what they do against a real PostgreSQL is
shown by the demo script.

## Known gaps (as of 2026-11-16)

- **Staff roles** are not enforced: `DbStaffIdentity` only reads `user.type`. Feature 1's roles decide who may do what.
- **F3 seat API**: the seat map, the 5-minute hold, confirm and release are ours. `DbSeats` writes the holds into
  `seat_assignment` and reads the seats from the aircraft's layout; replace the provider with G13's contract when it exists.
  Feature 3's special-assistance codes are read from `booking_service_request` (`requested` or `accepted`).
- **F11 tier**: `FixtureTiers` returns none, so nobody gets the tier bag bonus or boarding group 2/3 by tier.
- **F5 checkout**: `DbPayments` writes the `payment` row itself, with `provider = 'fake'`. When feature 5 exposes a
  checkout, that provider is the one file to replace.
- **`nameOnPassport` is not stored**: the schema keeps only the last four characters of the passport number, so the
  staff view answers `null` and the frontends show "—".
- **The customer access shortcut**: a booking whose customer has no Clerk account (the seed's demo customer) has no
  owner to check, so whoever holds the check-in UUID may act on it. Bookings made by signed-in customers are closed to
  everyone but their owner (see "The owner of a check-in" above).
- **The counter's seat and bag columns show "—"**: the search rows carry neither a seat nor a bag count; the passenger
  panel shows both. The backend row needs the two values before the columns can be filled.
- **OCR** (`POST /check-ins/:id/document/ocr`) is not implemented (stretch goal).
- **QR**: the customer boarding pass encodes the reference with `qrcode-generator` (customer-web's one dependency, added 2026-11-11 at Ajarn's request); the staff gate screen can read it from the webcam (`jsqr`, button "Start camera", added 2026-11-13 at Ajarn's request) or take it typed; the staff print view still shows the reference as text.
- **Nest-generated 404/400/401 bodies** (unknown route, malformed JSON, missing token) do not use the `{ error }`
  envelope; a global exception filter in `main.ts` is the platform's call (raised with the Dev leads). The frontends
  map these to code `UNKNOWN`.
- **LoggerNotify writes with `logger.log`**, which `main.ts`'s logger levels (`error`, `warn`) hide. The audit is a
  real feature 15 row in `db` mode; only the memory mode still logs it.
- **Two agents can move two flights to the same free gate at the same instant**: `setGate` reads the open boardings
  and then writes its own. A partial unique index on the open boardings of a gate would close the gap; the database
  team decides (see the `shortcut:` comment in `gate.service.ts`).
