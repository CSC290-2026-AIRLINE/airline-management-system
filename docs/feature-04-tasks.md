# Feature 4 (G12): Task split

_Last updated: 2026-10-24_

Feature 4 (pricing, fare rules and finance) is split across three members. Each person owns one related area end to end:

- the **backend** module(s)
- the **staff-web pages** for those modules
- the **tests**
- **talking to the other teams** that use that area

| Member | Area | Weight |
|--------|------|--------|
| **Core** | Ticket price calculation: base fares, rules, quotes, promos | Heaviest |
| **Member B** | Finance and currency: money the airline records and reports | Heavy |
| **Member C** | Ticket add-on charges: seat fees, taxes, overweight baggage | Small |

All 15 Feature 4 tables already exist in the Level 1 schema (`apps/backend/src/db/prisma/schema.prisma`), so nothing is waiting on the Database Team.

Table definitions and rules: [feature-04-schema-review.md](feature-04-schema-review.md). Setup: [feature-04-getting-started.md](feature-04-getting-started.md).

---

## Rules for everyone

1. **Copy `apps/backend/src/modules/pricing/fare-class/`** for every new resource:
   - controller → service → DTOs → spec
   - soft delete
   - `pricingError(...)` for errors

   Step-by-step: [feature-04-fare-class-crud-guide.md](feature-04-fare-class-crud-guide.md).
2. **Use the shared lists.** Cabin and seat type come from `CABINS` and `SEAT_TYPES` in `pricing.constants.ts`. New error codes go in `pricing.errors.ts`.
3. **Service rules:**
   - every read filters `deleted_at: null`
   - every update sets `updated_at`
   - map Prisma error `P2002` to 409
   - wrap multi-write steps in one `$transaction`
4. **Register new controllers and services in `pricing.module.ts`.** That's the only file you touch outside your own folder.
5. **Don't edit** `schema.prisma`, migrations, `main.ts`, `package.json` or `auth/`. Ask Core first.
6. **One resource per branch and PR**, under ~400 lines.
   - Branch from `feat-04-feat-basic-CRUD`.
   - Name it `feat-04-<name>`.
   - Commit messages: `feat(g12): ...`.
7. **Before every PR,** run `lint`, `format:check`, `test` and `build` with `-w apps/backend` (or `-w apps/staff-web`).
8. **Staff pages** go in `apps/staff-web/src/features/pricing/`, under `routes/_authenticated/`.
   - Show the backend's `message`.
   - Use `code` for special cases, e.g. highlight the code field on `*_CODE_TAKEN`.

---

## Core: ticket price calculation (heaviest)
Step-by-step guide: [feature-04-member-a-guide.md](feature-04-member-a-guide.md)

Every task is one step in working out a ticket's price: base fare → rule adjustments → seat fee → promo → taxes → quote.

### Done

- [x] Pricing module scaffold, constants, error format
- [x] Fare class CRUD: `/api/staff/fare-classes`

### Tasks

1. **Base fares** (`base-fare/`)
   - [ ] CRUD at `/api/staff/base-fares`: amount per (route, fare class)
   - [ ] Unique per (route, fare class) among live rows → 409
   - [ ] Fare class must be live → 404 `FARE_CLASS_NOT_FOUND`
   - [ ] Refuse to delete a fare class that still has live base fares → 409 `FARE_CLASS_IN_USE`
2. **Fare rule route**
   - [ ] `GET` and `PATCH /api/staff/fare-classes/:id/rule` over the restriction and fee columns of `fare_class`
3. **Pricing settings** (`settings/`)
   - [ ] `GET /api/staff/settings` and `PUT /api/staff/settings/:key`
   - [ ] Closed list of keys:
     - `quote_hold_minutes`: a positive whole number
     - `base_currency`: seed-only and **read-only**
4. **Pricing rule engine** (`pricing-rule/`)
   - [ ] CRUD at `/api/staff/pricing-rules`, with groups `urgency`, `load`, `month` and `period`
   - [ ] Validation:
     - a rule only carries its own group's columns
     - minimum ≤ maximum
     - seats-left % between 0 and 100
     - `adjustment_pct > -100`
     - priority > 0
   - [ ] Reorder endpoint, in one transaction: add 1000 to the group's priorities, then write the final order
5. **Fare quotes** (`fare-quote/`)
   - [ ] `POST /api/fare-quotes`:
     - base fare
     - rule groups in order (urgency → load → month → period); the first active rule by priority wins per group
     - seat fee
     - promo
     - taxes, with percentages taken on the discounted subtotal and not compounded
   - [ ] Round half up **on every line**; the lines are authoritative
   - [ ] Days to departure: calendar dates in the origin airport's timezone
   - [ ] Reuse a live quote when the key matches (`IS NOT DISTINCT FROM`) and `quoted_at <= sim_now < expires_at`
   - [ ] Store `currency` and `fare_rule_snapshot` on the quote. Quotes and lines are **never updated or deleted**.
   - [ ] `GET /api/fare-quotes/:id/fee`: cancel and change fees from the snapshot (used by Feature 5b)
   - [ ] Error codes:
     - `FLIGHT_NOT_FOUND` 404
     - `FLIGHT_NOT_BOOKABLE` 409
     - `BASE_FARE_MISSING` 422
     - `UPSTREAM_UNAVAILABLE` 502
   - [ ] Test with the worked example: 100.00 → 110.00 → 126.50 → 113.85 → **121.82**
6. **Promo codes** (`promo-code/`)
   - [ ] CRUD at `/api/staff/promo-codes`:
     - a percentage **or** a fixed amount, never both
     - timestamp validity checked against the simulation clock
     - `max_uses`
   - [ ] `PROMO_INVALID` with `details.reason`: `unknown`, `expired`, `not_yet_valid`, `exhausted` or `inactive`
   - [ ] `POST /api/fare-quotes/:id/redeem` is idempotent: insert with `ON CONFLICT DO NOTHING` and increment `used_count` in one transaction
7. **Staff pages**
   - [ ] fare classes
   - [ ] base fares
   - [ ] pricing rules, with drag-and-drop reorder
   - [ ] promo codes
   - [ ] settings

### Talks to

| Team | About |
|------|-------|
| Feature 2 (flights/routes) | Route and flight data for quotes; `route_id` format |
| Feature 3b (booking/PNR) | Stores `quote_id`; re-quotes at checkout if the quote expired; checks seat availability itself; calls redeem on confirm |
| Feature 15 (audit) | How pricing changes are logged |

---

## Member B: finance and currency (heavy)

Step-by-step guide: [feature-04-member-b-guide.md](feature-04-member-b-guide.md)

Every task is about money the airline records and reports. None of it depends on Core or Member C, so **start any time**.

### Tasks

1. **Currency rates** (`currency-rate/`): the warm-up, closest to fare class
   - [ ] Routes at `/api/staff/currency-rates`: list, get, create, update
     - primary key `currency_code`: three capital letters
     - `rate_per_base > 0`
   - [ ] Take `updated_by` from `@CurrentUser()`, never from the request body
   - [ ] Refuse a row for the base currency itself (its rate is always 1)
   - [ ] Service method `convert(amount, toCurrency)`, exported from `PricingModule` for Feature 2
2. **Payment schedules** (`finance/payment-schedule`)
   - [ ] CRUD at `/api/staff/payment-schedules`:
     - `category`: `maintenance`, `staff`, `catering` or `other`
     - `payee`
     - `amount > 0`
     - `due_date`
   - [ ] Overdue filter: `scheduled` and `due_date` before the simulated today
3. **Mark paid → expense** (`finance/expense`)
   - [ ] `POST /api/staff/payment-schedules/:id/pay`, in **one transaction**:
     - set `status = paid` and `paid_on`
     - create the matching `expense`
   - [ ] A double-click must not create two expenses. The unique index on `expense(payment_schedule_id)` blocks the second one; map that to 409 or return the existing expense.
   - [ ] Expense CRUD at `/api/staff/expenses`. Reject edits and deletes of expenses that have a `payment_schedule_id` (409).
4. **Monthly finance summary** (`finance/summary`)
   - [ ] Recompute a month on demand: `POST /api/staff/finance/summary/:month/recompute`
   - [ ] Cash basis: revenue by the month payment was captured, costs by `incurred_on`
   - [ ] `profit = revenue − pass_through − refunds − maintenance − staff − catering − other`. A CHECK constraint enforces this.
   - [ ] `GET /api/staff/finance/summary?month=` for staff and Feature 14
5. **Staff pages**
   - [ ] currency rates
   - [ ] payment schedules (overdue highlighted; the "Mark paid" button is disabled while the request runs)
   - [ ] expenses (rows created from a schedule are read-only)
   - [ ] monthly summary

### Talks to

| Team | About |
|------|-------|
| Feature 5a / 5b (payments/refunds) | Where revenue and refund amounts come from; confirm the cash basis; what `refund_amount` contains |
| Feature 14 (BI) | Shape of the monthly summary response |
| Feature 2 (flights) | How they call currency conversion |

---

## Member C: ticket add-on charges (small)
Step-by-step guide: [feature-04-member-c-guide.md](feature-04-member-c-guide.md)

Every task is a charge added on top of the fare, and each one is a near-copy of fare class. **Do seat fees and taxes first**: Core's quote engine reads both.

### Tasks

1. **Seat fees** (`seat-fee/`): do this first
   - [ ] CRUD at `/api/staff/seat-fees`: `cabin`, `seat_type`, `amount >= 0`
   - [ ] Unique (cabin, seat_type) among live rows → 409 `SEAT_FEE_EXISTS`
   - [ ] **Public** `GET /api/seat-fees?cabin=&seat_type=` (use `@Public()`, so customers can call it) for Feature 6 check-in. No match → 404.
2. **Taxes and fees** (`tax-fee/`)
   - [ ] CRUD at `/api/staff/tax-fees`:
     - `code`, `name`
     - `kind`: `tax`, `surcharge` or `fee`
     - `calc_type`: `flat` or `pct`
     - `value >= 0`
     - `is_active`
   - [ ] Unique `code` among live rows → 409 `TAX_FEE_CODE_TAKEN`
   - [ ] If `calc_type = pct`, then `value <= 100`
   - [ ] Code format: capitals, digits and `_`
3. **Overweight baggage** (`baggage-rate/`)
   - [ ] CRUD at `/api/staff/baggage-rates`:
     - `fare_class_id`
     - `route_id`: optional; empty means the fare class default
     - `free_allowance_kg`, `rate_per_kg`, `max_bag_kg`
   - [ ] Unique (fare class, route), where an empty route counts as a value
   - [ ] Fare class must be live → 404
   - [ ] Charge calculation, e.g. `GET /api/baggage-charge?fare_class_id=&route_id=&weight_kg=`:
     - a route-specific rate wins over the default
     - no rate → 404
     - over `max_bag_kg` → 422
     - charge = `ceil(weight − allowance) × rate_per_kg`, or 0 if under the allowance
4. **Staff pages**
   - [ ] seat fees, as a cabin × seat type grid
   - [ ] taxes and fees
   - [ ] baggage rates
5. **Group test-case document** (you finish first, so this is yours)
   - [ ] Write `docs/feature-04-test-cases.md` with columns ID, steps, input, expected, pass/fail. Cover every member's endpoints.
   - [ ] Baggage cases, with allowance 20 kg, rate 100/kg, max 32 kg:

     | Weight | Expected |
     |--------|----------|
     | 19 kg | 0 |
     | 20 kg | 0 |
     | 20.1 kg | 100 |
     | 25 kg | 500 |
     | 33 kg | 422 |

   - [ ] Seed data: a few fare classes, seat fees, taxes, and one promo in each state

### Talks to

| Team | About |
|------|-------|
| Feature 6 (check-in) | Uses public `GET /seat-fees` |
| Baggage feature | Uses the baggage charge calculation |
| Feature 9 (aircraft) | Same cabin and seat-type lists as ours |

---

## Order of work

| Week | Core | Member B | Member C |
|------|------|----------|----------|
| 1 | Base fares, fare rule route, settings | Currency rates | **Seat fees**, **taxes** |
| 2 | Pricing rule engine | Payment schedules, mark paid → expense | Baggage rates + charge |
| 3 | Fare quotes | Monthly summary | Staff pages, test cases |
| 4 | Promo codes + redeem, staff pages | Staff pages | Test cases, help where needed |

**Dependencies:**

- Core's quote engine needs C's seat fees and taxes. That's why C does them in week 1.
- B's summary needs revenue numbers from Features 5a/5b. Agree the format with them early.

## Done means

- PR merged into the team branch (then into `dev` through a PR)
- Tests pass, and the endpoints are listed in the PR
- Staff page works against the real backend
- [feature-04-progress.md](feature-04-progress.md) updated
