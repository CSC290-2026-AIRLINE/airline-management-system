# F4 — Pricing, fare rules, and finance

> **Status: COMMITTED SCHEMA — inventory checked 27 Oct 2026 against `dev` commit `46a7f55be46a2237545869cbec356cd61e5a31d6`.** The SQL and Prisma table/column inventories match: **84 tables / 772 columns**, including F2 approvals, F8 crew/rostering and F7 screening Iteration-03. Committed migrations do not prove deployment or completed application behavior.

**Tables (15):** [`fare_class`](#table-fare_class) · [`base_fare`](#table-base_fare) · [`pricing_rule`](#table-pricing_rule) · [`seat_fee`](#table-seat_fee) · [`overweight_baggage_rate`](#table-overweight_baggage_rate) · [`tax_fee`](#table-tax_fee) · [`currency_rate`](#table-currency_rate) · [`promo_code`](#table-promo_code) · [`pricing_setting`](#table-pricing_setting) · [`fare_quote`](#table-fare_quote) · [`fare_quote_line`](#table-fare_quote_line) · [`promo_redemption`](#table-promo_redemption) · [`payment_schedule`](#table-payment_schedule) · [`expense`](#table-expense) · [`finance_monthly_summary`](#table-finance_monthly_summary)

<a id="table-fare_class"></a>

### `fare_class`

Fare product, cabin, and refund/change restrictions and fees.

**Important behavior:** The former one-to-one `fare_rule` design is merged into this table.

| Column                      | SQL type        | Constraints / linkage                                        | Meaning                                                  |
| --------------------------- | --------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| `id`                        | `UUID`          | PK; required; default `gen_random_uuid()`                    | Unique identifier for this record.                       |
| `code`                      | `TEXT`          | required                                                     | Stable short code for this record.                       |
| `cabin`                     | `TEXT`          | required; Allowed: economy, premium_economy, business, first | Cabin class on which the configuration or price applies. |
| `name`                      | `TEXT`          | required                                                     | Human-readable name.                                     |
| `min_advance_purchase_days` | `INTEGER`       | required; default `0`; CHECK                                 | Minimum permitted advance purchase days.                 |
| `refundable`                | `BOOLEAN`       | required; default `false`                                    | Whether this fare permits cancellation refunds.          |
| `changeable`                | `BOOLEAN`       | required; default `false`                                    | Whether this fare permits changing the booking.          |
| `cancel_fee_flat`           | `NUMERIC(12,2)` | required; default `0`; CHECK                                 | Fixed cancellation charge in the base currency.          |
| `cancel_fee_pct`            | `NUMERIC(5,2)`  | required; default `0`; CHECK                                 | Percentage for cancel fee.                               |
| `change_fee_flat`           | `NUMERIC(12,2)` | required; default `0`; CHECK                                 | Fixed fee for a booking change in the base currency.     |
| `change_fee_pct`            | `NUMERIC(5,2)`  | required; default `0`; CHECK                                 | Percentage for change fee.                               |
| `is_active`                 | `BOOLEAN`       | required; default `true`                                     | Whether the record is enabled for new use.               |
| `created_at`                | `TIMESTAMPTZ`   | required; default `now()`                                    | Actual database creation timestamp.                      |
| `updated_at`                | `TIMESTAMPTZ`   | required; default `now()`                                    | Last modification timestamp (application-maintained).    |
| `deleted_at`                | `TIMESTAMPTZ`   | nullable                                                     | Soft-delete timestamp; NULL means not deleted.           |

**Indexes:** `fare_class_code_uq` (unique; `(code) WHERE deleted_at IS NULL`).

<a id="table-base_fare"></a>

### `base_fare`

Starting fare for a particular route and fare class.

**Important behavior:** One non-deleted fare per route/class combination. Currency is the base currency from `pricing_setting`.

| Column          | SQL type        | Constraints / linkage                     | Meaning                                               |
| --------------- | --------------- | ----------------------------------------- | ----------------------------------------------------- |
| `id`            | `UUID`          | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                    |
| `route_id`      | `UUID`          | cross-FK → `route(id)`; required          | Related route identifier.                             |
| `fare_class_id` | `UUID`          | FK → `fare_class(id)`; required           | Related fare-class identifier.                        |
| `amount`        | `NUMERIC(12,2)` | required; CHECK                           | Monetary amount in the stated or base currency.       |
| `created_at`    | `TIMESTAMPTZ`   | required; default `now()`                 | Actual database creation timestamp.                   |
| `updated_at`    | `TIMESTAMPTZ`   | required; default `now()`                 | Last modification timestamp (application-maintained). |
| `deleted_at`    | `TIMESTAMPTZ`   | nullable                                  | Soft-delete timestamp; NULL means not deleted.        |

**Indexes:** `base_fare_route_class_uq` (unique; `(route_id, fare_class_id) WHERE deleted_at IS NULL`); `base_fare_class_idx` (index; `(fare_class_id)`).

**Cross-feature linkage:** `route_id` → `route(id)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-pricing_rule"></a>

### `pricing_rule`

Conditional percentage adjustments applied by the fare calculation engine.

**Important behavior:** Conditions within one rule are ANDed; NULL means any value. Within a group, first matching active rule by priority wins; contributions from different groups multiply. Group-shape validation is backend-managed.

| Column               | SQL type       | Constraints / linkage                           | Meaning                                                          |
| -------------------- | -------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `id`                 | `UUID`         | PK; required; default `gen_random_uuid()`       | Unique identifier for this record.                               |
| `rule_group`         | `TEXT`         | required; Allowed: urgency, load, month, period | Rule family: urgency, load, month, or period.                    |
| `name`               | `TEXT`         | required                                        | Copied onto the quote line, e.g. 'H-7'.                          |
| `priority`           | `INTEGER`      | required                                        | Evaluation order within its rule group.                          |
| `min_days_out`       | `INTEGER`      | nullable                                        | Lower days-before-departure bound.                               |
| `max_days_out`       | `INTEGER`      | nullable                                        | Upper days-before-departure bound.                               |
| `min_seats_left_pct` | `NUMERIC(5,2)` | nullable                                        | Lower proportion of seats still available, as a percent.         |
| `max_seats_left_pct` | `NUMERIC(5,2)` | nullable                                        | Upper proportion of seats still available, as a percent.         |
| `month`              | `SMALLINT`     | nullable; CHECK                                 | Applies to this calendar month.                                  |
| `start_date`         | `DATE`         | nullable                                        | First calendar date of this period.                              |
| `end_date`           | `DATE`         | nullable                                        | Last calendar date of this period.                               |
| `fare_class_id`      | `UUID`         | FK → `fare_class(id)`; nullable                 | Related fare-class identifier.                                   |
| `adjustment_pct`     | `NUMERIC(6,2)` | required; CHECK                                 | Percentage fare adjustment; positive raises, negative discounts. |
| `is_active`          | `BOOLEAN`      | required; default `true`                        | Whether the record is enabled for new use.                       |
| `created_at`         | `TIMESTAMPTZ`  | required; default `now()`                       | Actual database creation timestamp.                              |
| `updated_at`         | `TIMESTAMPTZ`  | required; default `now()`                       | Last modification timestamp (application-maintained).            |
| `deleted_at`         | `TIMESTAMPTZ`  | nullable                                        | Soft-delete timestamp; NULL means not deleted.                   |

**Table-level SQL constraints:** `CHECK (rule_group <> 'urgency' OR min_days_out IS NOT NULL OR max_days_out IS NOT NULL)` · `CHECK (rule_group <> 'load' OR min_seats_left_pct IS NOT NULL OR max_seats_left_pct IS NOT NULL)` · `CHECK (rule_group <> 'month' OR month IS NOT NULL)` · `CHECK (rule_group <> 'period' OR (start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date))`

**Indexes:** `pricing_rule_group_priority_uq` (unique; `(rule_group, priority) WHERE deleted_at IS NULL`); `pricing_rule_class_idx` (index; `(fare_class_id) WHERE fare_class_id IS NOT NULL`).

<a id="table-seat_fee"></a>

### `seat_fee`

Additional seat-selection fee by cabin and seat category.

| Column       | SQL type        | Constraints / linkage                                        | Meaning                                                  |
| ------------ | --------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| `id`         | `UUID`          | PK; required; default `gen_random_uuid()`                    | Unique identifier for this record.                       |
| `cabin`      | `TEXT`          | required; Allowed: economy, premium_economy, business, first | Cabin class on which the configuration or price applies. |
| `seat_type`  | `TEXT`          | required; Allowed: normal, exit_row, extra_legroom           | 'blocked' is never sold.                                 |
| `amount`     | `NUMERIC(12,2)` | required; CHECK                                              | Monetary amount in the stated or base currency.          |
| `created_at` | `TIMESTAMPTZ`   | required; default `now()`                                    | Actual database creation timestamp.                      |
| `updated_at` | `TIMESTAMPTZ`   | required; default `now()`                                    | Last modification timestamp (application-maintained).    |
| `deleted_at` | `TIMESTAMPTZ`   | nullable                                                     | Soft-delete timestamp; NULL means not deleted.           |

**Indexes:** `seat_fee_cabin_type_uq` (unique; `(cabin, seat_type) WHERE deleted_at IS NULL`).

<a id="table-overweight_baggage_rate"></a>

### `overweight_baggage_rate`

Free baggage allowance and overweight rates by fare class, optionally route-specific.

**Important behavior:** `route_id=NULL` provides the default rate for a fare class; route-specific rows override it. Maximum bag weight NULL means no maximum.

| Column              | SQL type        | Constraints / linkage                     | Meaning                                                            |
| ------------------- | --------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `id`                | `UUID`          | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                                 |
| `fare_class_id`     | `UUID`          | FK → `fare_class(id)`; required           | Related fare-class identifier.                                     |
| `route_id`          | `UUID`          | cross-FK → `route(id)`; nullable          | Related route identifier.                                          |
| `free_allowance_kg` | `NUMERIC(5,1)`  | required; CHECK                           | Weight measure for free allowance in kilograms.                    |
| `rate_per_kg`       | `NUMERIC(12,2)` | required; CHECK                           | Additional amount per kilogram over the free allowance.            |
| `max_bag_kg`        | `NUMERIC(5,1)`  | nullable; CHECK                           | Maximum allowed weight for one bag; NULL means no defined maximum. |
| `is_active`         | `BOOLEAN`       | required; default `true`                  | Whether the record is enabled for new use.                         |
| `created_at`        | `TIMESTAMPTZ`   | required; default `now()`                 | Actual database creation timestamp.                                |
| `updated_at`        | `TIMESTAMPTZ`   | required; default `now()`                 | Last modification timestamp (application-maintained).              |
| `deleted_at`        | `TIMESTAMPTZ`   | nullable                                  | Soft-delete timestamp; NULL means not deleted.                     |

**Indexes:** `overweight_baggage_rate_uq` (unique; `(fare_class_id, route_id) NULLS NOT DISTINCT WHERE deleted_at IS NULL`); `overweight_baggage_rate_route_idx` (index; `(route_id) WHERE route_id IS NOT NULL`).

**Cross-feature linkage:** `route_id` → `route(id)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-tax_fee"></a>

### `tax_fee`

Reference rules for flat or percentage taxes, surcharges, and fees.

| Column       | SQL type        | Constraints / linkage                     | Meaning                                               |
| ------------ | --------------- | ----------------------------------------- | ----------------------------------------------------- |
| `id`         | `UUID`          | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                    |
| `code`       | `TEXT`          | required                                  | Stable short code for this record.                    |
| `name`       | `TEXT`          | required                                  | Human-readable name.                                  |
| `kind`       | `TEXT`          | required; Allowed: tax, surcharge, fee    | Subcategory defining how this row behaves.            |
| `calc_type`  | `TEXT`          | required; Allowed: flat, pct              | Calc type for this record.                            |
| `value`      | `NUMERIC(12,2)` | required; CHECK                           | An amount if flat, a percent if pct.                  |
| `is_active`  | `BOOLEAN`       | required; default `true`                  | Whether the record is enabled for new use.            |
| `created_at` | `TIMESTAMPTZ`   | required; default `now()`                 | Actual database creation timestamp.                   |
| `updated_at` | `TIMESTAMPTZ`   | required; default `now()`                 | Last modification timestamp (application-maintained). |
| `deleted_at` | `TIMESTAMPTZ`   | nullable                                  | Soft-delete timestamp; NULL means not deleted.        |

**Indexes:** `tax_fee_code_uq` (unique; `(code) WHERE deleted_at IS NULL`).

<a id="table-currency_rate"></a>

### `currency_rate`

Currency exchange rates used only to display amounts converted from the base currency.

**Important behavior:** `rate_per_base` indicates target-currency units per one unit of the base currency. Prices are still stored in base currency.

| Column          | SQL type        | Constraints / linkage      | Meaning                                                  |
| --------------- | --------------- | -------------------------- | -------------------------------------------------------- |
| `currency_code` | `TEXT`          | PK; required               | ISO-style currency code used for display rates.          |
| `rate_per_base` | `NUMERIC(14,6)` | required; CHECK            | Units of display currency per one unit of base currency. |
| `updated_at`    | `TIMESTAMPTZ`   | required; default `now()`  | Last modification timestamp (application-maintained).    |
| `updated_by`    | `UUID`          | FK → `staff(id)`; required | Staff member who last changed this setting.              |

<a id="table-promo_code"></a>

### `promo_code`

Promo/corporate discount codes with validity and redemption limits.

**Important behavior:** Exactly one of percentage or fixed discount must be supplied. `used_count` cannot exceed `max_uses`.

| Column            | SQL type        | Constraints / linkage                     | Meaning                                                    |
| ----------------- | --------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `id`              | `UUID`          | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                         |
| `code`            | `TEXT`          | required                                  | Stable short code for this record.                         |
| `kind`            | `TEXT`          | required; Allowed: promo, corporate       | Subcategory defining how this row behaves.                 |
| `discount_pct`    | `NUMERIC(5,2)`  | nullable; CHECK                           | Percentage discount (instead of discount_amount).          |
| `discount_amount` | `NUMERIC(12,2)` | nullable; CHECK                           | Fixed discount in base currency (instead of discount_pct). |
| `valid_from`      | `TIMESTAMPTZ`   | required                                  | Simulation clock: valid_from <= now < valid_to.            |
| `valid_to`        | `TIMESTAMPTZ`   | required                                  | Time/date after which this record is no longer valid.      |
| `max_uses`        | `INTEGER`       | nullable; CHECK                           | Upper redemption count; NULL means unlimited.              |
| `used_count`      | `INTEGER`       | required; default `0`                     | Number of recorded redemptions.                            |
| `is_active`       | `BOOLEAN`       | required; default `true`                  | Whether the record is enabled for new use.                 |
| `created_at`      | `TIMESTAMPTZ`   | required; default `now()`                 | Actual database creation timestamp.                        |
| `updated_at`      | `TIMESTAMPTZ`   | required; default `now()`                 | Last modification timestamp (application-maintained).      |
| `deleted_at`      | `TIMESTAMPTZ`   | nullable                                  | Soft-delete timestamp; NULL means not deleted.             |

**Table-level SQL constraints:** `CHECK ((discount_pct IS NULL) <> (discount_amount IS NULL))` · `CHECK (valid_to > valid_from)` · `CHECK (max_uses IS NULL OR used_count <= max_uses)`

**Indexes:** `promo_code_code_uq` (unique; `(code) WHERE deleted_at IS NULL`).

<a id="table-pricing_setting"></a>

### `pricing_setting`

Pricing configuration, including immutable base currency and quote hold duration.

**Important behavior:** The base currency is intended to be set by a reference seed and not edited after setup; backend enforces the lock.

| Column       | SQL type      | Constraints / linkage                                    | Meaning                                               |
| ------------ | ------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `key`        | `TEXT`        | PK; required; Allowed: quote_hold_minutes, base_currency | Configuration key.                                    |
| `value`      | `TEXT`        | required                                                 | Setting or measured value.                            |
| `updated_at` | `TIMESTAMPTZ` | required; default `now()`                                | Last modification timestamp (application-maintained). |
| `updated_by` | `UUID`        | FK → `staff(id)`; nullable                               | Staff member who last changed this setting.           |

<a id="table-fare_quote"></a>

### `fare_quote`

Time-limited, immutable price snapshot for a flight, fare class, discount, and seat type.

**Important behavior:** Quoted amounts are per passenger, and stored quotes are intended to be immutable in backend logic (not a SQL update-prevention trigger). Quote rows may be shared; they do not reserve seats.

| Column               | SQL type        | Constraints / linkage                              | Meaning                                             |
| -------------------- | --------------- | -------------------------------------------------- | --------------------------------------------------- |
| `id`                 | `UUID`          | PK; required; default `gen_random_uuid()`          | Unique identifier for this record.                  |
| `flight_id`          | `UUID`          | cross-FK → `flight(id)`; required                  | Related dated flight identifier.                    |
| `fare_class_id`      | `UUID`          | FK → `fare_class(id)`; required                    | Related fare-class identifier.                      |
| `promo_code_id`      | `UUID`          | FK → `promo_code(id)`; nullable                    | Identifier of the related promo code.               |
| `seat_type`          | `TEXT`          | nullable; Allowed: normal, exit_row, extra_legroom | Seat category to which the fee or quote applies.    |
| `currency`           | `TEXT`          | required                                           | Base currency when quoted.                          |
| `total_amount`       | `NUMERIC(12,2)` | required                                           | Final quoted price per passenger, base currency.    |
| `seats_left_pct`     | `NUMERIC(5,2)`  | required                                           | Available-seat percentage snapshot at quoting.      |
| `days_to_departure`  | `INTEGER`       | required                                           | Days remaining until departure when quoted.         |
| `fare_rule_snapshot` | `JSONB`         | required                                           | JSON copy of fare-class restrictions at quote time. |
| `quoted_at`          | `TIMESTAMPTZ`   | required                                           | Simulation clock.                                   |
| `expires_at`         | `TIMESTAMPTZ`   | required                                           | Quoted_at + quote_hold_minutes.                     |
| `created_at`         | `TIMESTAMPTZ`   | required; default `now()`                          | Actual database creation timestamp.                 |

**Table-level SQL constraints:** `UNIQUE (id, promo_code_id)`

**Indexes:** `fare_quote_lookup_ix` (index; `(flight_id, fare_class_id, expires_at DESC)`).

**Cross-feature linkage:** `flight_id` → `flight(id)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-fare_quote_line"></a>

### `fare_quote_line`

Itemized fare components that explain how a quoted total was calculated.

**Important behavior:** `source_id` is polymorphic (rule, promo, or tax record); SQL does not enforce a foreign key for it.

| Column          | SQL type        | Constraints / linkage                                               | Meaning                                                    |
| --------------- | --------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `id`            | `UUID`          | PK; required; default `gen_random_uuid()`                           | Unique identifier for this record.                         |
| `fare_quote_id` | `UUID`          | FK → `fare_quote(id)`; required                                     | No cascade: quotes are never deleted.                      |
| `seq`           | `INTEGER`       | required                                                            | Line ordering inside this quote.                           |
| `kind`          | `TEXT`          | required; Allowed: base, rule, seat_fee, promo, tax, surcharge, fee | Subcategory defining how this row behaves.                 |
| `label`         | `TEXT`          | required                                                            | Copied at quote time.                                      |
| `rate_pct`      | `NUMERIC(6,2)`  | nullable                                                            | Percent used for percent-based components; otherwise NULL. |
| `amount`        | `NUMERIC(12,2)` | required                                                            | Signed monetary adjustment contributed by the line.        |
| `source_id`     | `UUID`          | nullable                                                            | Optional original rule/promo/tax identifier without an FK. |

**Table-level SQL constraints:** `UNIQUE (fare_quote_id, seq)`

<a id="table-promo_redemption"></a>

### `promo_redemption`

One-time redemption that associates a confirmed quote with its promo code.

**Important behavior:** Unique quote reference prevents duplicate redemptions; composite FK ensures the promo matches the one on that quote.

| Column          | SQL type      | Constraints / linkage                                              | Meaning                               |
| --------------- | ------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `id`            | `UUID`        | PK; required; default `gen_random_uuid()`                          | Unique identifier for this record.    |
| `promo_code_id` | `UUID`        | FK → `fare_quote(id, promo_code_id) (composite)`; required         | Identifier of the related promo code. |
| `fare_quote_id` | `UUID`        | FK → `fare_quote(id, promo_code_id) (composite)`; required; unique | Identifier of the related fare quote. |
| `redeemed_at`   | `TIMESTAMPTZ` | required                                                           | Simulation clock.                     |
| `created_at`    | `TIMESTAMPTZ` | required; default `now()`                                          | Actual database creation timestamp.   |

**Table-level SQL constraints:** `FOREIGN KEY (fare_quote_id, promo_code_id) REFERENCES fare_quote (id, promo_code_id)`

**Indexes:** `promo_redemption_promo_idx` (index; `(promo_code_id)`).

<a id="table-payment_schedule"></a>

### `payment_schedule`

Planned outgoing payments and their scheduled/paid status.

**Important behavior:** `paid_on` is present if and only if the status is paid.

| Column        | SQL type        | Constraints / linkage                                     | Meaning                                                             |
| ------------- | --------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| `id`          | `UUID`          | PK; required; default `gen_random_uuid()`                 | Unique identifier for this record.                                  |
| `category`    | `TEXT`          | required; Allowed: maintenance, staff, catering, other    | Classification of this record.                                      |
| `payee`       | `TEXT`          | required                                                  | Person or organization scheduled to receive payment.                |
| `description` | `TEXT`          | nullable                                                  | Human-readable description or details.                              |
| `amount`      | `NUMERIC(12,2)` | required; CHECK                                           | Monetary amount in the stated or base currency.                     |
| `due_date`    | `DATE`          | required                                                  | Date when this payment is due.                                      |
| `status`      | `TEXT`          | required; default `'scheduled'`; Allowed: scheduled, paid | Current lifecycle status.                                           |
| `paid_on`     | `DATE`          | nullable                                                  | Simulated date; overdue = scheduled and due_date < simulated today. |
| `created_by`  | `UUID`          | FK → `staff(id)`; required                                | Staff member responsible for creating this record.                  |
| `created_at`  | `TIMESTAMPTZ`   | required; default `now()`                                 | Actual database creation timestamp.                                 |
| `updated_at`  | `TIMESTAMPTZ`   | required; default `now()`                                 | Last modification timestamp (application-maintained).               |
| `deleted_at`  | `TIMESTAMPTZ`   | nullable                                                  | Soft-delete timestamp; NULL means not deleted.                      |

**Table-level SQL constraints:** `CHECK ((status = 'paid') = (paid_on IS NOT NULL))`

**Indexes:** `payment_schedule_due_idx` (index; `(due_date) WHERE deleted_at IS NULL AND status = 'scheduled'`).

<a id="table-expense"></a>

### `expense`

Recognized operating expenses, optionally created from a paid payment schedule.

**Important behavior:** One live expense at most per linked payment schedule, preventing duplicate counting on retries.

| Column                | SQL type        | Constraints / linkage                                  | Meaning                                               |
| --------------------- | --------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| `id`                  | `UUID`          | PK; required; default `gen_random_uuid()`              | Unique identifier for this record.                    |
| `category`            | `TEXT`          | required; Allowed: maintenance, staff, catering, other | Classification of this record.                        |
| `description`         | `TEXT`          | required                                               | Human-readable description or details.                |
| `amount`              | `NUMERIC(12,2)` | required; CHECK                                        | Monetary amount in the stated or base currency.       |
| `incurred_on`         | `DATE`          | required                                               | Decides which month it lands in.                      |
| `payment_schedule_id` | `UUID`          | FK → `payment_schedule(id)`; nullable                  | Identifier of the related payment schedule.           |
| `created_by`          | `UUID`          | FK → `staff(id)`; required                             | Staff member responsible for creating this record.    |
| `created_at`          | `TIMESTAMPTZ`   | required; default `now()`                              | Actual database creation timestamp.                   |
| `updated_at`          | `TIMESTAMPTZ`   | required; default `now()`                              | Last modification timestamp (application-maintained). |
| `deleted_at`          | `TIMESTAMPTZ`   | nullable                                               | Soft-delete timestamp; NULL means not deleted.        |

**Indexes:** `expense_payment_schedule_uq` (unique; `(payment_schedule_id) WHERE payment_schedule_id IS NOT NULL AND deleted_at IS NULL`); `expense_month_ix` (index; `(incurred_on, category) WHERE deleted_at IS NULL`).

<a id="table-finance_monthly_summary"></a>

### `finance_monthly_summary`

Computed monthly cash-basis financial aggregates and profit.

**Important behavior:** Profit is validated by a CHECK formula. Revenue capture month, tax pass-through treatment, and the refund definition require agreement with F5a/F5b.

| Column                | SQL type        | Constraints / linkage | Meaning                                                                                |
| --------------------- | --------------- | --------------------- | -------------------------------------------------------------------------------------- |
| `month`               | `DATE`          | PK; required; CHECK   | First day of the month being summarized.                                               |
| `revenue_amount`      | `NUMERIC(14,2)` | required; default `0` | Amount for revenue in the applicable currency.                                         |
| `pass_through_amount` | `NUMERIC(14,2)` | required; default `0` | Taxes/surcharges included in revenue but owed to others.                               |
| `refund_amount`       | `NUMERIC(14,2)` | required; default `0` | Refunds excluded from net operating profit (exact scope pending F5a/F5b confirmation). |
| `maintenance_cost`    | `NUMERIC(14,2)` | required; default `0` | Total maintenance operating cost for the month.                                        |
| `staff_cost`          | `NUMERIC(14,2)` | required; default `0` | Total staff operating cost for the month.                                              |
| `catering_cost`       | `NUMERIC(14,2)` | required; default `0` | Total catering operating cost for the month.                                           |
| `other_cost`          | `NUMERIC(14,2)` | required; default `0` | Other operating expenses for the month.                                                |
| `profit_amount`       | `NUMERIC(14,2)` | required              | Revenue minus pass-through, refunds, and all cost categories.                          |
| `computed_at`         | `TIMESTAMPTZ`   | required              | Simulation clock.                                                                      |

**Table-level SQL constraints:** `CHECK (profit_amount = revenue_amount - pass_through_amount - refund_amount - maintenance_cost - staff_cost - catering_cost - other_cost)`

---

[← Database documentation home](../docs.md) · [Seed data](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
