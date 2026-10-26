# Feature 4 (G12): Member B guide (finance and currency)

_Last updated: 2026-10-25_

This guide explains **what your part does**, **why it exists**, and **what to do, step by step**. It doesn't teach the code: for that, copy the fare class module (`apps/backend/src/modules/pricing/fare-class/`) and follow [feature-04-fare-class-crud-guide.md](feature-04-fare-class-crud-guide.md).

Before you start, finish [feature-04-getting-started.md](feature-04-getting-started.md). You should be able to run the app, log in to staff web and call the fare class API from Postman.

---

## The big picture: what your part does

You build the airline's **money book**. It answers three questions for staff:

1. **"What do we owe, and when?"** → payment schedules
2. **"What have we actually spent?"** → expenses
3. **"Did we make a profit this month?"** → monthly finance summary

On top of that, you build **currency rates**, so prices and costs can be shown in other currencies (THB → USD, EUR…).

How the pieces connect:

```
Payment schedule ──(staff clicks "Mark paid")──▶ Expense ──┐
                                                           ├──▶ Monthly summary ──▶ Feature 14 (BI dashboards)
Manual expense (e.g. office supplies) ─────────────────────┘          ▲
                                                                      │
Ticket revenue and refunds (from Features 5a / 5b) ───────────────────┘

Currency rates ──▶ used by Feature 2 and by price display
```

None of your work depends on Core or Member C, so **you can start today**.

---

## Your tables (already in the database)

All four tables already exist in `apps/backend/src/db/prisma/schema.prisma`. **Don't edit that file.** If a column seems wrong or missing, tell Core, who will take it to the Database Team.

| Table | One row means | Key columns |
|-------|---------------|-------------|
| `currency_rate` | "1 unit of our base currency = X units of this currency" | `currency_code` (e.g. `USD`), `rate_per_base`, `updated_by` |
| `payment_schedule` | A bill the airline must pay by a date | `category`, `payee`, `amount`, `due_date`, `status`, `paid_on` |
| `expense` | Money the airline has actually spent | `category`, `description`, `amount`, `incurred_on`, `payment_schedule_id` |
| `finance_monthly_summary` | The profit report for one month | `month`, `revenue_amount`, the cost columns, `profit_amount` |

**Watch out: `created_by` and `updated_by` hold a `staff.id`, not a `user.id`.** The logged-in user from `@CurrentUser()` gives you a `user.id`, so you must look up the matching `staff` row (`staff.user_id = user.id`) and store its `id`. If there's no staff row, refuse the request (403).

---

## Step 0: Set up your branch

1. Pull the team branch:
   ```bash
   git switch feat-04-feat-basic-CRUD
   git pull
   ```
2. Create a branch for your first task:
   ```bash
   git switch -c feat-04-currency-rate-crud
   ```
3. Read these sections of [feature-04-schema-review.md](feature-04-schema-review.md):
   - point **2** (base currency)
   - point **11** (monthly report)
   - point **12** (mark paid)
   - point **15** (Feature 2 uses currency)
   - the **Finance** SQL at the bottom

Create **one branch per step below**, each with its own PR (under ~400 lines).

---

## Step 1: Currency rates (warm-up)

### What it does
Staff record exchange rates, e.g. "1 THB = 0.028 USD". Other parts of the system use these rates to show a price or cost in another currency.

- **Example:** a ticket costs 3,500 THB and the USD rate is 0.028, so it shows as 98.00 USD.
- **Who uses it:** staff (to manage rates), Feature 2 (flights) to convert costs, and possibly price display.

This is **display and conversion only**. Every amount is stored in the base currency (THB). Nothing is saved in USD.

### What to build

| Method | URL | Does |
|--------|-----|------|
| GET | `/api/staff/currency-rates` | List all rates |
| GET | `/api/staff/currency-rates/:code` | One rate, e.g. `/USD` |
| POST | `/api/staff/currency-rates` | Add a currency |
| PATCH | `/api/staff/currency-rates/:code` | Change its rate |

Also add a **convert** function in the service: give it an amount in the base currency and a currency code, and it returns the converted amount. Export it from `PricingModule` so Feature 2 can call it.

### Rules
- `currency_code` must be exactly **3 capital letters** (`USD`, `EUR`, `JPY`). Otherwise 400.
- `rate_per_base` must be **greater than 0**.
- Adding a code that already exists → **409**.
- Unknown code on GET or PATCH → **404**.
- **No row for the base currency itself.** THB → THB is always 1, so refuse it (400). The base currency is a pricing setting that Core is building. Until it's ready, assume `THB` and ask Core how to read it.
- `updated_by` comes from the **logged-in staff member**, never from the request body.
- This table has no `deleted_at`, so ask Core whether you need DELETE at all. Probably not; staff just update the rate.
- When converting, round to 2 decimal places (half up).

### Done when
- [ ] All 4 endpoints work in Postman
- [ ] Bad code, rate ≤ 0, duplicate, unknown code and base currency all fail with the right status
- [ ] A unit test for each rule
- [ ] PR opened

---

## Step 2: Payment schedules

### What it does
A **to-do list of bills**: money the airline has agreed to pay on a future date.

- **Example:** "Pay Thai Aero Maintenance 250,000 THB for engine check, due 30 Nov."
- Staff add bills, see which are coming up, and see which are **overdue** (due date passed, still unpaid).

A schedule has only two states:
- `scheduled`: not paid yet
- `paid`: done (Step 3 handles this)

### What to build

| Method | URL | Does |
|--------|-----|------|
| GET | `/api/staff/payment-schedules` | List. Filters: `?status=scheduled\|paid` and `?overdue=true` |
| GET | `/api/staff/payment-schedules/:id` | One schedule |
| POST | `/api/staff/payment-schedules` | Add a bill |
| PATCH | `/api/staff/payment-schedules/:id` | Edit a bill |
| DELETE | `/api/staff/payment-schedules/:id` | Soft delete |

### Rules
- `category` is one of `maintenance`, `staff`, `catering`, `other`.
- `amount` must be **greater than 0**.
- `payee` (who gets paid) is required. `description` is optional.
- `due_date` is a date only (no time).
- New schedules always start as `scheduled`. Staff **can't** set `status` or `paid_on` through POST or PATCH; only Step 3 changes them.
- **A paid schedule can't be edited or deleted** → 409. It's history now.
- **Overdue** = `status = scheduled` and `due_date` is before **today in the simulation**. The system has a simulated clock, so ask Core how to read "simulated today".
- `created_by` = the logged-in staff member's `staff.id`.

### Done when
- [ ] CRUD works, including the overdue filter
- [ ] Editing or deleting a paid schedule fails with 409
- [ ] Unit tests
- [ ] PR opened

---

## Step 3: Mark paid → expense

### What it does
When staff pay a bill, they click **"Mark paid"**. Two things must happen **together**:

1. The schedule changes to `paid`, with `paid_on` set to simulated today.
2. A matching **expense** is created: the same category and amount, `incurred_on` = the paid date, and a link back to the schedule.

Expenses can also be added **by hand** for costs that never had a schedule (e.g. "office supplies, 3,000 THB").

### Why "together" matters
If step 1 works and step 2 fails (or the reverse), the books are wrong: a bill shows as paid but the money never appears as spent. So both writes go inside **one database transaction**: either both happen or neither does.

### Why double-clicks matter
If staff click "Mark paid" twice quickly, the airline must **not** record the payment twice. The database already blocks two expenses for the same schedule (a unique index on `expense.payment_schedule_id`). Your job is to handle the second click gracefully: return **409** or the existing expense, never a 500.

### What to build

| Method | URL | Does |
|--------|-----|------|
| POST | `/api/staff/payment-schedules/:id/pay` | Mark paid and create the expense (one transaction) |
| GET | `/api/staff/expenses` | List. Filters: `?month=2026-11` and `?category=` |
| GET | `/api/staff/expenses/:id` | One expense |
| POST | `/api/staff/expenses` | Add a manual expense |
| PATCH | `/api/staff/expenses/:id` | Edit a manual expense |
| DELETE | `/api/staff/expenses/:id` | Soft delete a manual expense |

### Rules
- Pay a schedule that's already paid → **409**.
- Pay a schedule that doesn't exist or is deleted → **404**.
- An expense **created from a schedule** (it has `payment_schedule_id`) **can't be edited or deleted** → 409. To fix a mistake, staff must go through the schedule.
- Manual expenses: `category` from the same list, `amount > 0`, `description` required, `incurred_on` required.
- `created_by` = the logged-in staff member's `staff.id`.

### Done when
- [ ] Paying creates exactly one expense, with the same amount and category
- [ ] Paying twice → 409 and still only one expense (check in Prisma Studio)
- [ ] Editing or deleting a schedule-created expense → 409
- [ ] Manual expense CRUD works
- [ ] Unit tests, including "the second pay doesn't create a second expense"
- [ ] PR opened

---

## Step 4: Monthly finance summary

### What it does
The **profit report** for one month. One row per month, e.g. `2026-11-01` means November 2026.

```
profit = revenue
       − pass-through (taxes and surcharges collected for the government, not ours)
       − refunds
       − maintenance cost − staff cost − catering cost − other cost
```

**Worked example (November):**

| | Amount (THB) |
|---|---|
| Ticket revenue | 1,000,000 |
| − Pass-through (VAT inside that revenue) | 65,000 |
| − Refunds | 50,000 |
| − Maintenance | 250,000 |
| − Staff | 300,000 |
| − Catering | 80,000 |
| − Other | 20,000 |
| **Profit** | **235,000** |

The database has a CHECK that `profit_amount` equals this formula exactly. If your numbers don't add up, the save fails.

### Where the numbers come from

| Column | Source |
|--------|--------|
| `maintenance_cost`, `staff_cost`, `catering_cost`, `other_cost` | **Your expenses**: the sum of `amount` per category, where `incurred_on` is in that month and the expense isn't deleted |
| `revenue_amount`, `refund_amount` | **Features 5a / 5b** (payments and refunds). You need to agree with them how to get these. |
| `pass_through_amount` | Taxes and surcharges inside the revenue, from the quote lines (ask Core) or from 5a |

**Cash basis** means money counts in the month it actually moved:
- revenue → the month the payment was captured
- costs → the month of `incurred_on`

Not the flight date, not the booking date.

**If 5a / 5b aren't ready yet:** build it with revenue, refunds and pass-through set to 0, so costs and profit still work. Fill them in once you've agreed the format with those teams.

### What to build

| Method | URL | Does |
|--------|-----|------|
| POST | `/api/staff/finance/summary/:month/recompute` | Recalculate one month (e.g. `2026-11`) and save it, replacing the old row |
| GET | `/api/staff/finance/summary?month=2026-11` | Read one month |
| GET | `/api/staff/finance/summary?from=2026-01&to=2026-12` | Read a range (for charts and Feature 14) |

### Rules
- `month` is always the **first day** of the month (`2026-11-01`). Reject anything else.
- Recompute is safe to run again and again: it overwrites that month's row.
- `computed_at` = simulated now.
- Later (ask Core): a scheduled job may recompute the current month automatically.

### Done when
- [ ] Recomputing a month with known expenses gives the right cost columns and profit
- [ ] Running it twice gives the same result, still one row
- [ ] The read endpoints work
- [ ] Unit test with the worked example above
- [ ] PR opened

---

## Step 5: Staff pages

Build these in `apps/staff-web/src/features/pricing/` once each endpoint is merged.

| Page | What staff do there |
|------|---------------------|
| **Currency rates** | See all rates; add a currency; edit a rate. Show who updated it last, and when. |
| **Payment schedules** | List bills with filters (scheduled / paid / overdue). Overdue rows in red. Add and edit bills. A **"Mark paid"** button, disabled while the request runs, so double-clicks can't happen. |
| **Expenses** | List by month and category. Add manual expenses. Rows created from a schedule are read-only (no edit or delete buttons). |
| **Monthly summary** | Pick a month and see the table from the worked example. A **"Recompute"** button. |

Show the backend's error `message` to the user (e.g. "Schedule is already paid").

---

## Step 6: Talk to the other teams

This is part of your job. Write down what each team agrees to, and share it in the G12 chat or add it to the schema review.

| Team | Ask them |
|------|----------|
| **Feature 5a (payments)** | How do we get the revenue captured per month? An endpoint we call, or a service we import? Does the amount include taxes? |
| **Feature 5b (refunds)** | How do we get refunds per month? Does the refund amount include taxes and surcharges? We assume **not**. |
| **Feature 14 (BI dashboards)** | What shape do you want the monthly summary in? One month or a range? Which fields? |
| **Feature 2 (flights)** | Will you call our currency `convert`? What do you need: a service method or an HTTP endpoint? |

---

## How to test by hand

Use Postman exactly as in the getting-started guide (Bearer token from staff-web). Suggested order:

1. Add currency `USD` with rate `0.028`. Try `usd`, `US`, rate `0`, `THB` and a duplicate `USD`; each should fail.
2. Add 3 payment schedules: one due last month, one due next month, one in another category.
3. Check `?overdue=true` shows only the first one.
4. Pay the first one, then pay it again (expect 409). In Prisma Studio (`npm run db:studio`), check that the `expense` table has exactly one row for it.
5. Try to edit that expense (expect 409). Add a manual expense in the same month.
6. Recompute that month. Check the cost columns match your expenses and the profit is correct.

---

## Questions to ask Core

- How do I read **simulated today** and **simulated now**?
- How do I read the **base currency** setting? Until settings exist, is `THB` hard-coded OK?
- Is DELETE needed for currency rates?
- Where does **pass-through** come from: quote lines or Feature 5a?
- Do we want a scheduled job for the monthly summary, and when?
