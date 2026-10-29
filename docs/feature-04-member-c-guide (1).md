# Feature 4 (G12): Member C guide (ticket add-on charges)

_Last updated: 2026-10-25_

This guide explains **what your part does**, **why it exists**, and **what to do, step by step**. It doesn't teach the code. Every resource you build is a near-copy of the fare class module (`apps/backend/src/modules/pricing/fare-class/`), so copy it and follow [feature-04-fare-class-crud-guide.md](feature-04-fare-class-crud-guide.md) (especially the **Copy checklist** at the end).

Before you start, finish [feature-04-getting-started.md](feature-04-getting-started.md). You should be able to run the app, log in to staff web and call the fare class API from Postman.

---

## The big picture: what your part does

A ticket's price isn't just the fare. Extra charges get added on top, and **you own all of them**:

1. **Seat fees:** extra money for a better seat (exit row, extra legroom)
2. **Taxes and fees:** VAT, airport fees, fuel surcharge, booking fee
3. **Overweight baggage:** extra money when a bag is heavier than the free allowance

How your pieces fit into a ticket price (Core builds the calculation; you build the data it reads):

```
Base fare 3,000.00            ← Core
± rule adjustments            ← Core (e.g. +10% close to departure)
+ seat fee   200.00           ← YOU (seat_fee)
− promo                       ← Core
+ taxes / fees                ← YOU (tax_fee)
= ticket total

Later, at check-in:
+ overweight baggage charge   ← YOU (overweight_baggage_rate)
```

**Core's quote engine reads your seat fees and taxes**, so build those two **first**. Core is waiting on them.

---

## Your tables (already in the database)

All three tables already exist in `apps/backend/src/db/prisma/schema.prisma`. **Don't edit that file.** If something seems wrong, tell Core.

| Table | One row means | Key columns |
|-------|---------------|-------------|
| `seat_fee` | "This seat type in this cabin costs X extra" | `cabin`, `seat_type`, `amount` |
| `tax_fee` | One tax or fee applied to every ticket | `code`, `name`, `kind`, `calc_type`, `value`, `is_active` |
| `overweight_baggage_rate` | Baggage allowance and price per extra kg for a fare class (optionally on one route) | `fare_class_id`, `route_id`, `free_allowance_kg`, `rate_per_kg`, `max_bag_kg` |

Shared value lists, already in `apps/backend/src/modules/pricing/pricing.constants.ts`. Use these; don't write your own lists.

| List | Values |
|------|--------|
| `CABINS` | `economy`, `premium_economy`, `business`, `first` |
| `SEAT_TYPES` | `normal`, `exit_row`, `extra_legroom` |

---

## Step 0: Set up your branch

1. Pull the team branch:
   ```bash
   git switch feat-04-feat-basic-CRUD
   git pull
   ```
2. Create a branch for your first task:
   ```bash
   git switch -c feat-04-seat-fee-crud
   ```
3. Read these parts of [feature-04-schema-review.md](feature-04-schema-review.md):
   - point **13** (overweight baggage)
   - point **14** (public seat fee)
   - point **17** (shared lists)
   - point **18** (validation)
   - the `seat_fee`, `tax_fee` and `overweight_baggage_rate` SQL

Create **one branch per step below**, each with its own PR (under ~400 lines).

---

## Step 1: Seat fees (do this first)

### What it does
Some seats cost more. Staff set the extra price for each **cabin + seat type** combination.

- **Example:** Economy exit row = +300 THB, Economy extra legroom = +500 THB, Economy normal = 0 THB.
- **Who uses it:**
  - **staff**, to set the prices
  - **Core's quote engine**, to add the seat fee to the ticket price
  - **Feature 6 (check-in)**, when a passenger changes seat at check-in and has to pay the difference

The fee is the same for every flight. It only depends on the cabin and the seat type.

### What to build

| Method | URL | Who can call | Does |
|--------|-----|--------------|------|
| GET | `/api/staff/seat-fees` | Staff | List all seat fees |
| GET | `/api/staff/seat-fees/:id` | Staff | One seat fee |
| POST | `/api/staff/seat-fees` | Staff | Add one |
| PATCH | `/api/staff/seat-fees/:id` | Staff | Change the amount (or cabin / seat type) |
| DELETE | `/api/staff/seat-fees/:id` | Staff | Soft delete |
| GET | `/api/seat-fees?cabin=economy&seat_type=exit_row` | **Anyone, even customers** | Look up one fee (for check-in) |

The last route is **public**: mark it with `@Public()`. It's the only public route in your part, so don't make the others public.

### Rules
- `cabin` must be from `CABINS`, and `seat_type` from `SEAT_TYPES`. Otherwise 400.
- `amount` must be **0 or more**, with at most 2 decimals.
- **Only one live row per cabin + seat type.** Adding economy/exit_row twice → **409** `SEAT_FEE_EXISTS`. (The database blocks it too; map Prisma error `P2002` to 409, same as fare class.)
- After a soft delete, the same cabin + seat type can be added again.
- Public lookup:
  - both query params are required (400 if missing or invalid)
  - no matching row → **404** `SEAT_FEE_NOT_FOUND`

  Ask Core whether "no row" should mean 0 instead. For now use 404.
- Add your new error codes to `pricing.errors.ts`.

### Done when
- [ ] Staff CRUD works in Postman
- [ ] Duplicate cabin + seat type → 409. Re-adding after delete works.
- [ ] The public lookup works **with no token**
- [ ] Unit tests for duplicate, not found and soft delete
- [ ] PR opened. Tell Core it's merged, because the quote engine needs it.

---

## Step 2: Taxes and fees

### What it does
Charges added to **every ticket** on top of the fare: government taxes, airport fees, surcharges and booking fees. Each one is either:

- a **flat** amount, e.g. "Airport fee: 700 THB per ticket", or
- a **percentage**, e.g. "VAT: 7% of the price"

Examples:

| code | name | kind | calc_type | value |
|------|------|------|-----------|-------|
| `VAT` | Value added tax | `tax` | `pct` | 7 |
| `APT_FEE` | Airport service fee | `fee` | `flat` | 700 |
| `FUEL` | Fuel surcharge | `surcharge` | `flat` | 250 |

**Who uses it:** staff, to manage the list, and **Core's quote engine**, which adds every *active* tax or fee as a line on the quote. Percentages are taken on the price after the promo discount, and they don't compound (VAT isn't charged on the airport fee). Core handles that maths; you just store the data correctly.

**Why `kind` matters:** taxes and surcharges are money collected **for others** (e.g. the government). They're not airline profit, and Member B's finance report subtracts them. So `kind` must be accurate.

### What to build

| Method | URL | Does |
|--------|-----|------|
| GET | `/api/staff/tax-fees` | List. Active only by default; `?include_inactive=true` for all. |
| GET | `/api/staff/tax-fees/:id` | One |
| POST | `/api/staff/tax-fees` | Add |
| PATCH | `/api/staff/tax-fees/:id` | Edit, or turn on and off with `is_active` |
| DELETE | `/api/staff/tax-fees/:id` | Soft delete |

### Rules
- `code`:
  - required
  - **capital letters, digits and `_` only** (e.g. `VAT`, `APT_FEE`)
  - unique among live rows → **409** `TAX_FEE_CODE_TAKEN`
- `name`: required, not empty.
- `kind` is one of `tax`, `surcharge`, `fee`.
- `calc_type` is one of `flat`, `pct`.
- `value` must be **0 or more**, with at most 2 decimals.
- If `calc_type` is `pct`, then `value` must be **100 or less**. A 150% tax makes no sense → 400.
- Watch the PATCH case: changing only `calc_type` to `pct` on a row whose value is 700 must also fail. Check the **final** combined values, not just the fields that were sent.
- Turning a tax off (`is_active: false`) keeps it in the database. The quote engine just ignores it.

### Done when
- [ ] CRUD works, including the `include_inactive` toggle
- [ ] Bad code format, duplicate code and pct > 100 (on create **and** on PATCH) all fail correctly
- [ ] Unit tests
- [ ] PR opened. Tell Core it's merged.

---

## Step 3: Overweight baggage

### What it does
Each passenger gets a **free baggage allowance** per bag. If a bag is heavier, they pay for every extra kg. The allowance and the price depend on the **fare class**, and can optionally be different on a specific **route**.

**Example rates:**

| Fare class | Route | Free per bag | Price per extra kg | Max bag weight |
|------------|-------|--------------|--------------------|----------------|
| Economy (Y) | *(default, any route)* | 20 kg | 100 THB | 32 kg |
| Economy (Y) | BKK → NRT | 23 kg | 150 THB | 32 kg |
| Business (J) | *(default)* | 30 kg | 100 THB | 32 kg |

**How the charge is worked out:**

1. Find the rate. A row **for this route** wins; otherwise use the fare class **default** (the row with no route).
2. If there's no rate at all → error (404).
3. If the bag is heavier than `max_bag_kg` → **refused, not charged** (422). It must go as cargo.
4. Extra weight = bag weight − free allowance. If that's 0 or less → charge **0**.
5. Otherwise, charge = **extra weight rounded UP to a whole kg** × price per kg.

**Worked examples** (Economy default: 20 kg free, 100 THB/kg, max 32 kg):

| Bag weight | Extra | Rounded up | Charge |
|------------|-------|------------|--------|
| 18 kg | — | — | **0** |
| 20 kg | 0 | 0 | **0** |
| 20.1 kg | 0.1 | 1 | **100** |
| 25 kg | 5 | 5 | **500** |
| 25.4 kg | 5.4 | 6 | **600** |
| 33 kg | — | — | **422, too heavy** |

**Who uses it:** staff, to set the rates, and the **baggage feature / check-in**, which asks "how much for this bag?".

### What to build

| Method | URL | Does |
|--------|-----|------|
| GET | `/api/staff/baggage-rates` | List (filter by `?fare_class_id=`) |
| GET | `/api/staff/baggage-rates/:id` | One |
| POST | `/api/staff/baggage-rates` | Add |
| PATCH | `/api/staff/baggage-rates/:id` | Edit |
| DELETE | `/api/staff/baggage-rates/:id` | Soft delete |
| GET | `/api/baggage-charge?fare_class_id=&route_id=&weight_kg=` | Work out the charge for one bag (agree the exact path and who can call it with Core) |

### Rules
- `fare_class_id` is required and must be a **live** fare class → otherwise 404 `FARE_CLASS_NOT_FOUND`.
- `route_id` is optional. Empty means "default for this fare class". If given, it must be a real route (the `route` table belongs to Feature 2; read-only for you).
- **Only one live row per fare class + route**, and an empty route counts as a value, so a fare class can have only one default → 409.
- `free_allowance_kg` ≥ 0, `rate_per_kg` ≥ 0, `max_bag_kg` > 0 or empty (empty means no limit).
- `free_allowance_kg` must be less than `max_bag_kg` when both are set.
- `weight_kg` in the charge lookup must be greater than 0.

### Done when
- [ ] CRUD works. Duplicate default and duplicate route override both fail.
- [ ] The charge lookup gives every result in the worked-examples table
- [ ] A route override beats the default. No rate gives 404.
- [ ] Unit tests for every row of the worked-examples table
- [ ] PR opened

---

## Step 4: Staff pages

Build these in `apps/staff-web/src/features/pricing/` once each endpoint is merged.

| Page | What staff do there |
|------|---------------------|
| **Seat fees** | A **grid**: cabins down the side, seat types across the top, an amount in each cell. Click a cell to set or change it. Empty cells mean "no fee set". |
| **Taxes and fees** | A table of all taxes and fees with an on/off toggle. Add/edit form: code, name, kind, flat or %, value. Show "%" or "THB" next to the value depending on the type. |
| **Baggage rates** | A table grouped by fare class. Pick a fare class, then a route (or "Default, all routes"). Fields: free kg, price per kg, max kg. Optional: a small "try it" box (enter a weight, see the charge). |

Show the backend's error `message` to the user (e.g. "Tax code VAT is already in use"), and highlight the field for duplicate codes.

---

## Step 5: The group test-case document (yours)

You finish your backend first, so you write the test cases for **all of Feature 4**.

1. Create `docs/feature-04-test-cases.md` with a table: **ID · Feature · Steps · Input · Expected · Pass/Fail**.
2. Add cases for **your** endpoints (everything in the "Done when" lists above).
3. Add cases for **fare classes**: they already exist, so use the Postman steps in the getting-started guide.
4. Ask Core and Member B for their rules as they finish, and add cases for them. Include Core's worked quote example: 100.00 → 110.00 → 126.50 → 113.85 → **121.82**.
5. Run each case by hand in Postman and fill in Pass/Fail.
6. Prepare **seed data**: a few fare classes, all seat fees, VAT + airport fee + fuel surcharge, baggage rates and one promo code in each state. Ask Core where the seed file should live.

---

## Step 6: Talk to the other teams

Write down what each team agrees to, and share it in the G12 chat.

| Team | Ask them |
|------|----------|
| **Feature 6 (check-in)** | You'll call `GET /api/seat-fees?cabin=&seat_type=`. Is that enough? Do you need 0 instead of 404 when there's no fee? |
| **Baggage feature** | How will you get the overweight charge? Through our endpoint, or by importing our service? Do you send fare class + route, or a booking/ticket ID? |
| **Feature 9 (aircraft)** | Confirm you use the same cabin and seat-type names as ours. |

---

## How to test by hand

Use Postman as in the getting-started guide (Bearer token from staff-web).

1. **Seat fees:**
   - add economy/exit_row = 300
   - add it again (409)
   - look it up with **no token** using the public route
   - look up first/exit_row, which has no row (404)
2. **Taxes:**
   - add VAT (pct, 7) and APT_FEE (flat, 700)
   - try code `vat` (400), pct 150 (400), duplicate VAT (409)
   - PATCH APT_FEE to `calc_type: pct` (400, because 700 > 100)
   - turn VAT off and check it disappears from the default list
3. **Baggage:**
   - add an Economy default rate (20 / 100 / 32) and a BKK→NRT override
   - run every weight from the worked-examples table
   - check the override wins on that route

---

## Questions to ask Core

- Public seat fee lookup with no row: 404 or 0?
- Exact path and access for the baggage charge lookup: public, or staff only?
- Where should the seed data file live?
- Have the quote engine's needs from `seat_fee` and `tax_fee` changed?
