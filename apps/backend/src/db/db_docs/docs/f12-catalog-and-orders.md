# F12 — Product catalogue, menus, and customer orders

> **Status: MERGED LEVEL 1 SCHEMA — verified against `dev` on 21 Oct 2026 (`752428e732da`).** [PR #14](https://github.com/CSC290-2026-AIRLINE/airline-management-system/pull/14) merged on 12 Oct 2026 (16:54 UTC). The F1/F2/F4/F7/F9/F12/F15 SQL dictionary describes the committed 69-table Level 1 schema; Feature 8 is documented separately as an **unmerged proposal**. Repository merge is not proof of deployment to any running database or final feature-owner approval.

**Tables (7):** [`product`](#table-product) · [`product_dietary`](#table-product_dietary) · [`product_offering`](#table-product_offering) · [`cabin_setting`](#table-cabin_setting) · [`catering_setting`](#table-catering_setting) · [`product_order`](#table-product_order) · [`product_order_line`](#table-product_order_line)

**Other F12 section:** [Inventory, catering, and stock](./f12-inventory-and-catering.md)


**Dependencies:** F12 depends on F1 staff, F7 customer, and F2/F9 references. IDs from F3b bookings and F5 payments are held without SQL FKs while those schemas are unavailable.

<a id="table-product"></a>
### `product`

Catalogue of meals, snacks, drinks, and duty-free items, with price and shelf life.

**Important behavior:** Meal dietary type codes include STD, VGML, MOML, KSML, DBML, and GFML. Duty-free has no shelf-life field; other categories require a positive shelf life.

| Column | SQL type | Constraints / linkage | Meaning |
|---|---|---|---|
| `id` | `UUID` | PK; required; default `gen_random_uuid()` | Unique identifier for this record. |
| `sku` | `TEXT` | required | Stock-keeping unit used to identify a product. |
| `category` | `TEXT` | required; Allowed: meal, snack, beverage, duty_free | Classification of this record. |
| `type_code` | `TEXT` | required; default `'STD'`; Allowed: STD, VGML, MOML, KSML, DBML, GFML | Special meal/diet type code; STD for non-meals. |
| `name` | `TEXT` | required | Human-readable name. |
| `description` | `TEXT` | nullable | Human-readable description or details. |
| `price_amount` | `NUMERIC(12,2)` | required; CHECK | Amount for price in the applicable currency. |
| `purchase_cost_amount` | `NUMERIC(12,2)` | nullable; CHECK | Unit cost used for procurement/accounting. |
| `shelf_life_days` | `INTEGER` | nullable; CHECK | Expected usable days from receipt; NULL for duty-free. |
| `is_premium` | `BOOLEAN` | required; default `false` | Premium meals are outside the tier benefit. |
| `is_active` | `BOOLEAN` | required; default `true` | Whether the record is enabled for new use. |
| `image_key` | `TEXT` | nullable | Object storage key for product image. |
| `image_updated_at` | `TIMESTAMPTZ` | nullable | Timestamp when image updated occurred (see simulation-time conventions if applicable). |
| `created_at` | `TIMESTAMPTZ` | required; default `now()` | Actual database creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | required; default `now()` | Last modification timestamp (application-maintained). |
| `deleted_at` | `TIMESTAMPTZ` | nullable | Soft-delete timestamp; NULL means not deleted. |

**Table-level SQL constraints:** `CHECK (category = 'meal' OR type_code = 'STD')` · `CHECK ((category = 'duty_free') = (shelf_life_days IS NULL))` · `UNIQUE (id, category)`

**Indexes:** `product_sku_uq` (unique; `(sku) WHERE deleted_at IS NULL`).

<a id="table-product_dietary"></a>
### `product_dietary`

Dietary labels assigned to a product.

| Column | SQL type | Constraints / linkage | Meaning |
|---|---|---|---|
| `product_id` | `UUID` | PK; FK → `product(id)`; required | Related onboard product identifier. |
| `attribute` | `TEXT` | PK; required; Allowed: halal, vegetarian, vegan, kosher, diabetic, gluten_free | Dietary characteristic assigned to a product. |

**Table-level SQL constraints:** `PRIMARY KEY (product_id, attribute)`

<a id="table-product_offering"></a>
### `product_offering`

Product availability on a network-, route-, or flight-specific cabin menu.

**Important behavior:** Scope can be network, route, or flight. The most specific scope with rows for a cabin replaces the less specific menu. The default offering must be a meal (backend rule).

| Column | SQL type | Constraints / linkage | Meaning |
|---|---|---|---|
| `id` | `UUID` | PK; required; default `gen_random_uuid()` | Unique identifier for this record. |
| `product_id` | `UUID` | FK → `product(id)`; required | Related onboard product identifier. |
| `scope` | `TEXT` | required; Allowed: network, route, flight | Menu level: network, route, or flight. |
| `route_id` | `UUID` | cross-FK → `route(id)`; nullable | Related route identifier. |
| `flight_id` | `UUID` | cross-FK → `flight(id)`; nullable | Related dated flight identifier. |
| `cabin` | `TEXT` | required; Allowed: economy, premium_economy, business, first | Cabin class on which the configuration or price applies. |
| `is_default` | `BOOLEAN` | required; default `false` | Default meal assignment within scope and cabin. |
| `is_active` | `BOOLEAN` | required; default `true` | Whether the record is enabled for new use. |
| `created_at` | `TIMESTAMPTZ` | required; default `now()` | Actual database creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | required; default `now()` | Last modification timestamp (application-maintained). |
| `deleted_at` | `TIMESTAMPTZ` | nullable | Soft-delete timestamp; NULL means not deleted. |

**Table-level SQL constraints:** `CHECK ((scope = 'network' AND route_id IS NULL AND flight_id IS NULL) OR (scope = 'route' AND route_id IS NOT NULL AND flight_id IS NULL) OR (scope = 'flight' AND flight_id IS NOT NULL AND route_id IS NULL))`

**Indexes:** `product_offering_uq` (unique; `(product_id, route_id, flight_id, cabin) NULLS NOT DISTINCT WHERE deleted_at IS NULL`); `product_offering_default_uq` (unique; `(route_id, flight_id, cabin) NULLS NOT DISTINCT WHERE is_default AND deleted_at IS NULL`).

**Cross-feature linkage:** `route_id` → `route(id)`; `flight_id` → `flight(id)`. Declared in Part 8; coordinate any decision to omit with Database Leads.

<a id="table-cabin_setting"></a>
### `cabin_setting`

Cabin meal-service, preorder, and stock-buffer policy at network/route/flight scope.

**Important behavior:** More-specific scopes override or inherit network defaults. The four inserted network defaults in schema are marked provisional pending the F12 owner.

| Column | SQL type | Constraints / linkage | Meaning |
|---|---|---|---|
| `id` | `UUID` | PK; required; default `gen_random_uuid()` | Unique identifier for this record. |
| `scope` | `TEXT` | required; Allowed: network, route, flight | Setting level: network, route, or flight. |
| `route_id` | `UUID` | cross-FK → `route(id)`; nullable | Related route identifier. |
| `flight_id` | `UUID` | cross-FK → `flight(id)`; nullable | Related dated flight identifier. |
| `cabin` | `TEXT` | required; Allowed: economy, premium_economy, business, first | Cabin class on which the configuration or price applies. |
| `meal_service` | `TEXT` | nullable; Allowed: complimentary, paid, none | Complimentary, paid, or no meal service. |
| `meal_selection` | `TEXT` | nullable; Allowed: choose, fixed | Selectable or fixed meal policy. |
| `included_per_passenger` | `INTEGER` | nullable; CHECK | 0 or 1 complimentary item allowance per passenger. |
| `preorder_enabled` | `BOOLEAN` | nullable | Whether passengers may order before departure. |
| `order_window_hours` | `INTEGER` | nullable; CHECK | Number of hours for order window. |
| `premium_meals_allowed` | `BOOLEAN` | nullable | Whether premium meal options may be selected. |
| `snacks_enabled` | `BOOLEAN` | nullable | Whether snack ordering is permitted for this scope. |
| `duty_free_enabled` | `BOOLEAN` | nullable | Whether duty-free products may be sold for this scope. |
| `onboard_buffer_percent` | `INTEGER` | nullable; CHECK | Extra stock buffer percentage. |
| `updated_by_staff_id` | `UUID` | FK → `staff(id)`; nullable | Staff member who last updated the record. |
| `updated_at` | `TIMESTAMPTZ` | required; default `now()` | Last modification timestamp (application-maintained). |

**Table-level SQL constraints:** `CHECK ((scope = 'network' AND route_id IS NULL AND flight_id IS NULL) OR (scope = 'route' AND route_id IS NOT NULL AND flight_id IS NULL) OR (scope = 'flight' AND flight_id IS NOT NULL AND route_id IS NULL))` · `CHECK (scope <> 'network' OR (meal_service IS NOT NULL AND meal_selection IS NOT NULL AND included_per_passenger IS NOT NULL AND preorder_enabled IS NOT NULL AND order_window_hours IS NOT NULL AND premium_meals_allowed IS NOT NULL AND snacks_enabled IS NOT NULL AND duty_free_enabled IS NOT NULL AND onboard_buffer_percent IS NOT NULL))`

**Indexes:** `cabin_setting_uq` (unique; `(route_id, flight_id, cabin) NULLS NOT DISTINCT`).

**Cross-feature linkage:** `route_id` → `route(id)`; `flight_id` → `flight(id)`. Declared in Part 8; coordinate any decision to omit with Database Leads.

<a id="table-catering_setting"></a>
### `catering_setting`

Onboard-order configuration such as payment hold duration.

**Important behavior:** Schema inserts `payment_hold_minutes=30`.

| Column | SQL type | Constraints / linkage | Meaning |
|---|---|---|---|
| `key` | `TEXT` | PK; required; Allowed: payment_hold_minutes | Configuration key. |
| `value` | `TEXT` | required | Setting or measured value. |
| `updated_at` | `TIMESTAMPTZ` | required; default `now()` | Last modification timestamp (application-maintained). |
| `updated_by` | `UUID` | FK → `staff(id)`; nullable | Staff member who last changed this setting. |

<a id="table-product_order"></a>
### `product_order`

Customer onboard-product order for a booking/flight, including payment status.

**Important behavior:** The booking and payment IDs refer to feature domains not yet modeled here; SQL does not provide those FKs. Order lifecycle is backend-managed.

| Column | SQL type | Constraints / linkage | Meaning |
|---|---|---|---|
| `id` | `UUID` | PK; required; default `gen_random_uuid()` | Unique identifier for this record. |
| `customer_id` | `UUID` | FK → `customer(id)`; required | Related customer account identifier. |
| `booking_id` | `UUID` | required | F3b booking ID, not enforced by FK in Level 1. |
| `flight_id` | `UUID` | cross-FK → `flight(id)`; required | Related dated flight identifier. |
| `cabin` | `TEXT` | required; Allowed: economy, premium_economy, business, first | Cabin class on which the configuration or price applies. |
| `status` | `TEXT` | required; default `'pending_payment'`; Allowed: pending_payment, confirmed, cancelled, expired | Current lifecycle status. |
| `total_amount` | `NUMERIC(12,2)` | required; CHECK | Amount for total in the applicable currency. |
| `currency` | `TEXT` | required | Base currency snapshot at order time. |
| `payment_id` | `UUID` | nullable | F5 payment ID; NULL for free orders. |
| `paid_at` | `TIMESTAMPTZ` | nullable | Simulation clock. |
| `expires_at` | `TIMESTAMPTZ` | required | Order payment/stock hold deadline on simulated clock. |
| `cancelled_at` | `TIMESTAMPTZ` | nullable | Simulation clock. |
| `created_at` | `TIMESTAMPTZ` | required; default `now()` | Actual database creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | required; default `now()` | Last modification timestamp (application-maintained). |

**Table-level SQL constraints:** `UNIQUE (id, flight_id)`

**Indexes:** `product_order_payment_uq` (unique; `(payment_id) WHERE payment_id IS NOT NULL`); `product_order_booking_idx` (index; `(booking_id)`); `product_order_customer_idx` (index; `(customer_id)`); `product_order_flight_idx` (index; `(flight_id, status)`).

**Cross-feature linkage:** `flight_id` → `flight(id)`. Declared in Part 8; coordinate any decision to omit with Database Leads.

<a id="table-product_order_line"></a>
### `product_order_line`

Product items within an order, including meal assignment and price basis.

**Important behavior:** One active meal per booked passenger per flight. Meal lines must have `booking_passenger_id` and quantity 1; free benefits have zero unit price.

| Column | SQL type | Constraints / linkage | Meaning |
|---|---|---|---|
| `id` | `UUID` | PK; required; default `gen_random_uuid()` | Unique identifier for this record. |
| `product_order_id` | `UUID` | FK → `product_order(id, flight_id) (composite)`; required | Identifier of the related product order. |
| `flight_id` | `UUID` | FK → `product_order(id, flight_id) (composite)`; required | Flight copied from the containing order; validated through composite FK. |
| `product_id` | `UUID` | FK → `product(id, category) (composite)`; required | Related onboard product identifier. |
| `category` | `TEXT` | FK → `product(id, category) (composite)`; required | Category copied from product, validated through composite FK. |
| `booking_passenger_id` | `UUID` | nullable | F3b booking traveller ID; present for meal lines, no FK yet. |
| `quantity` | `INTEGER` | required; CHECK | Number of items involved. |
| `unit_price_amount` | `NUMERIC(12,2)` | required; CHECK | Amount for unit price in the applicable currency. |
| `price_basis` | `TEXT` | required; default `'standard'`; Allowed: standard, tier_benefit, included | Reason for this price: standard, tier benefit, or included. |
| `created_at` | `TIMESTAMPTZ` | required; default `now()` | Actual database creation timestamp. |
| `deleted_at` | `TIMESTAMPTZ` | nullable | Soft-delete timestamp; NULL means not deleted. |

**Table-level SQL constraints:** `FOREIGN KEY (product_order_id, flight_id) REFERENCES product_order (id, flight_id)` · `FOREIGN KEY (product_id, category) REFERENCES product (id, category)` · `CHECK ((category = 'meal') = (booking_passenger_id IS NOT NULL))` · `CHECK (category <> 'meal' OR quantity = 1)` · `CHECK (price_basis = 'standard' OR unit_price_amount = 0)`

**Indexes:** `product_order_line_meal_uq` (unique; `(booking_passenger_id, flight_id) WHERE category = 'meal' AND deleted_at IS NULL`); `product_order_line_order_idx` (index; `(product_order_id)`).



---

[← Database documentation home](../docs.md) · [Seed data](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
