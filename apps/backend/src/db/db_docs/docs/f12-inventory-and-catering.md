# F12 — Inventory, catering, transfers, and sales

> **Status: COMMITTED SCHEMA — verified 24 Oct 2026 against `dev` commit `a97740c646b2a6e82448243db4817a7a5822e14b`.** The current SQL and Prisma schema contain **84 tables / 758 columns**, including F2 Iteration-03 and F8 crew/rostering. Committed migrations do not prove deployment or completed application behavior.

**Tables (14):** [`warehouse`](#table-warehouse) · [`supplier`](#table-supplier) · [`purchase_receipt`](#table-purchase_receipt) · [`warehouse_stock`](#table-warehouse_stock) · [`stock_batch`](#table-stock_batch) · [`catering_order`](#table-catering_order) · [`catering_order_line`](#table-catering_order_line) · [`stock_transfer`](#table-stock_transfer) · [`stock_transfer_line`](#table-stock_transfer_line) · [`aircraft_stock`](#table-aircraft_stock) · [`flight_report`](#table-flight_report) · [`flight_report_line`](#table-flight_report_line) · [`product_sale`](#table-product_sale) · [`stock_movement`](#table-stock_movement)

**Other F12 section:** [Product catalogue, menus, and orders](./f12-catalog-and-orders.md)

<a id="table-warehouse"></a>

### `warehouse`

Airport warehouse for incoming stock and departures.

**Important behavior:** At most one live warehouse per airport.

| Column         | SQL type      | Constraints / linkage                     | Meaning                                               |
| -------------- | ------------- | ----------------------------------------- | ----------------------------------------------------- |
| `id`           | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                    |
| `code`         | `TEXT`        | required; unique                          | Stable short code for this record.                    |
| `name`         | `TEXT`        | required                                  | Human-readable name.                                  |
| `airport_code` | `TEXT`        | cross-FK → `airport(iata_code)`; required | IATA code of the associated airport.                  |
| `created_at`   | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp.                   |
| `updated_at`   | `TIMESTAMPTZ` | required; default `now()`                 | Last modification timestamp (application-maintained). |
| `deleted_at`   | `TIMESTAMPTZ` | nullable                                  | Soft-delete timestamp; NULL means not deleted.        |

**Indexes:** `warehouse_airport_uq` (unique; `(airport_code) WHERE deleted_at IS NULL`).

**Cross-feature linkage:** `airport_code` → `airport(iata_code)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-supplier"></a>

### `supplier`

Supplier contact and associated airport.

| Column         | SQL type      | Constraints / linkage                     | Meaning                                        |
| -------------- | ------------- | ----------------------------------------- | ---------------------------------------------- |
| `id`           | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.             |
| `name`         | `TEXT`        | required                                  | Human-readable name.                           |
| `airport_code` | `TEXT`        | cross-FK → `airport(iata_code)`; required | IATA code of the associated airport.           |
| `contact`      | `TEXT`        | nullable                                  | Supplier contact details.                      |
| `is_active`    | `BOOLEAN`     | required; default `true`                  | Whether the record is enabled for new use.     |
| `created_at`   | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp.            |
| `deleted_at`   | `TIMESTAMPTZ` | nullable                                  | Soft-delete timestamp; NULL means not deleted. |

**Cross-feature linkage:** `airport_code` → `airport(iata_code)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-purchase_receipt"></a>

### `purchase_receipt`

Acknowledged delivery from a supplier into a warehouse.

**Important behavior:** Total delivery cost is derived from associated batches, not stored in this table.

| Column                 | SQL type      | Constraints / linkage                     | Meaning                                      |
| ---------------------- | ------------- | ----------------------------------------- | -------------------------------------------- |
| `id`                   | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.           |
| `supplier_id`          | `UUID`        | FK → `supplier(id)`; required             | Identifier of the related supplier.          |
| `warehouse_id`         | `UUID`        | FK → `warehouse(id)`; required            | Related warehouse identifier.                |
| `received_at`          | `TIMESTAMPTZ` | required                                  | Simulation clock.                            |
| `received_by_staff_id` | `UUID`        | FK → `staff(id)`; required                | Identifier of the related received by staff. |
| `created_at`           | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp.          |

<a id="table-warehouse_stock"></a>

### `warehouse_stock`

Current product on-hand, reserved and reorder quantities at a warehouse.

**Important behavior:** Reserved stock cannot exceed on-hand. Actual on-hand must match summed batch balances; backend transaction logic maintains it.

| Column              | SQL type      | Constraints / linkage                     | Meaning                                                       |
| ------------------- | ------------- | ----------------------------------------- | ------------------------------------------------------------- |
| `id`                | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                            |
| `warehouse_id`      | `UUID`        | FK → `warehouse(id)`; required            | Related warehouse identifier.                                 |
| `product_id`        | `UUID`        | FK → `product(id)`; required              | Related onboard product identifier.                           |
| `quantity_on_hand`  | `INTEGER`     | required; default `0`; CHECK              | Physical available total prior to removing reserved quantity. |
| `quantity_reserved` | `INTEGER`     | required; default `0`; CHECK              | Part of on-hand stock already promised to orders.             |
| `reorder_level`     | `INTEGER`     | required; default `0`; CHECK              | Threshold for replenishment.                                  |
| `updated_at`        | `TIMESTAMPTZ` | required; default `now()`                 | Last modification timestamp (application-maintained).         |

**Table-level SQL constraints:** `UNIQUE (warehouse_id, product_id)` · `CHECK (quantity_reserved <= quantity_on_hand)`

<a id="table-stock_batch"></a>

### `stock_batch`

Individually traceable received product batch with available quantity, cost, and expiry.

**Important behavior:** FEFO index supports earliest-expiring-first transfers. Damaged batches must not be transferred, enforced by the backend.

| Column                | SQL type        | Constraints / linkage                     | Meaning                                                   |
| --------------------- | --------------- | ----------------------------------------- | --------------------------------------------------------- |
| `id`                  | `UUID`          | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                        |
| `purchase_receipt_id` | `UUID`          | FK → `purchase_receipt(id)`; required     | Identifier of the related purchase receipt.               |
| `warehouse_id`        | `UUID`          | FK → `warehouse(id)`; required            | Related warehouse identifier.                             |
| `product_id`          | `UUID`          | FK → `product(id)`; required              | Related onboard product identifier.                       |
| `batch_code`          | `TEXT`          | required                                  | Supplier/warehouse identifier for a received stock batch. |
| `quantity_received`   | `INTEGER`       | required; CHECK                           | Quantity received.                                        |
| `quantity_remaining`  | `INTEGER`       | required; CHECK                           | Units still in this batch at the warehouse.               |
| `unit_cost_amount`    | `NUMERIC(12,2)` | required; CHECK                           | Purchase cost per unit at receipt.                        |
| `received_at`         | `TIMESTAMPTZ`   | required                                  | Simulation clock.                                         |
| `expires_at`          | `TIMESTAMPTZ`   | nullable                                  | Batch expiry; may be NULL for duty-free.                  |
| `is_damaged`          | `BOOLEAN`       | required; default `false`                 | Flag indicating whether damaged applies.                  |

**Table-level SQL constraints:** `UNIQUE (warehouse_id, product_id, batch_code)` · `UNIQUE (id, product_id)` · `CHECK (quantity_remaining <= quantity_received)`

**Indexes:** `stock_batch_fefo_idx` (index; `(warehouse_id, product_id, expires_at) WHERE quantity_remaining > 0`).

<a id="table-catering_order"></a>

### `catering_order`

One catering preparation and loading order for a flight.

**Important behavior:** One catering order per flight. Ordering cutoff is based on original scheduled departure, so a delay does not reopen it.

| Column                  | SQL type      | Constraints / linkage                                                     | Meaning                                                      |
| ----------------------- | ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `id`                    | `UUID`        | PK; required; default `gen_random_uuid()`                                 | Unique identifier for this record.                           |
| `flight_id`             | `UUID`        | cross-FK → `flight(id)`; required; unique                                 | Related dated flight identifier.                             |
| `warehouse_id`          | `UUID`        | FK → `warehouse(id)`; required                                            | Related warehouse identifier.                                |
| `status`                | `TEXT`        | required; default `'generated'`; Allowed: generated, loaded, closed, void | Current lifecycle status.                                    |
| `cutoff_at`             | `TIMESTAMPTZ` | required                                                                  | Simulated meal-ordering cutoff based on scheduled departure. |
| `generated_at`          | `TIMESTAMPTZ` | required                                                                  | Time the catering order was generated.                       |
| `generated_by_staff_id` | `UUID`        | FK → `staff(id)`; nullable                                                | NULL when the job ran it.                                    |
| `loaded_at`             | `TIMESTAMPTZ` | nullable                                                                  | Time the catering order was placed on aircraft.              |
| `closed_at`             | `TIMESTAMPTZ` | nullable                                                                  | Time catering order was closed.                              |
| `created_at`            | `TIMESTAMPTZ` | required; default `now()`                                                 | Actual database creation timestamp.                          |
| `updated_at`            | `TIMESTAMPTZ` | required; default `now()`                                                 | Last modification timestamp (application-maintained).        |

**Cross-feature linkage:** `flight_id` → `flight(id)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-catering_order_line"></a>

### `catering_order_line`

Products and quantities required for a cabin on a catering order.

**Important behavior:** One row per catering order/cabin/product/source. Quantity short tracks unfulfilled requirements.

| Column              | SQL type      | Constraints / linkage                                        | Meaning                                                                       |
| ------------------- | ------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `id`                | `UUID`        | PK; required; default `gen_random_uuid()`                    | Unique identifier for this record.                                            |
| `catering_order_id` | `UUID`        | FK → `catering_order(id)`; required                          | Identifier of the related catering order.                                     |
| `cabin`             | `TEXT`        | required; Allowed: economy, premium_economy, business, first | Cabin class on which the configuration or price applies.                      |
| `product_id`        | `UUID`        | FK → `product(id)`; required                                 | Related onboard product identifier.                                           |
| `quantity_required` | `INTEGER`     | required; CHECK                                              | Quantity required.                                                            |
| `quantity_short`    | `INTEGER`     | required; default `0`; CHECK                                 | Quantity short.                                                               |
| `source`            | `TEXT`        | required; Allowed: order, default                            | Whether the catering requirement came from a passenger order or default meal. |
| `created_at`        | `TIMESTAMPTZ` | required; default `now()`                                    | Actual database creation timestamp.                                           |

**Table-level SQL constraints:** `UNIQUE (catering_order_id, cabin, product_id, source)`

<a id="table-stock_transfer"></a>

### `stock_transfer`

Warehouse-to-aircraft stock movement associated with a flight.

**Important behavior:** A transfer moves stock from a warehouse to an aircraft; it does not create a purchase.

| Column           | SQL type      | Constraints / linkage                     | Meaning                             |
| ---------------- | ------------- | ----------------------------------------- | ----------------------------------- |
| `id`             | `UUID`        | PK; required; default `gen_random_uuid()` | Unique identifier for this record.  |
| `flight_id`      | `UUID`        | cross-FK → `flight(id)`; required         | Related dated flight identifier.    |
| `aircraft_id`    | `UUID`        | cross-FK → `aircraft(id)`; required       | Related aircraft identifier.        |
| `warehouse_id`   | `UUID`        | FK → `warehouse(id)`; required            | Related warehouse identifier.       |
| `transferred_at` | `TIMESTAMPTZ` | required                                  | Simulation clock.                   |
| `staff_id`       | `UUID`        | FK → `staff(id)`; required                | Related staff member identifier.    |
| `created_at`     | `TIMESTAMPTZ` | required; default `now()`                 | Actual database creation timestamp. |

**Cross-feature linkage:** `flight_id` → `flight(id)`; `aircraft_id` → `aircraft(id)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-stock_transfer_line"></a>

### `stock_transfer_line`

Batches and quantities moved in a stock transfer.

| Column              | SQL type  | Constraints / linkage                                    | Meaning                                   |
| ------------------- | --------- | -------------------------------------------------------- | ----------------------------------------- |
| `id`                | `UUID`    | PK; required; default `gen_random_uuid()`                | Unique identifier for this record.        |
| `stock_transfer_id` | `UUID`    | FK → `stock_transfer(id)`; required                      | Identifier of the related stock transfer. |
| `stock_batch_id`    | `UUID`    | FK → `stock_batch(id, product_id) (composite)`; required | Identifier of the related stock batch.    |
| `product_id`        | `UUID`    | FK → `stock_batch(id, product_id) (composite)`; required | Related onboard product identifier.       |
| `quantity`          | `INTEGER` | required; CHECK                                          | Number of items involved.                 |

**Table-level SQL constraints:** `FOREIGN KEY (stock_batch_id, product_id) REFERENCES stock_batch (id, product_id)`

<a id="table-aircraft_stock"></a>

### `aircraft_stock`

Inventory kept onboard a particular aircraft, tracked by stock batch.

**Important behavior:** Balances persist across flights and are tracked by batch, including that batch’s expiry.

| Column           | SQL type      | Constraints / linkage                                    | Meaning                                               |
| ---------------- | ------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `id`             | `UUID`        | PK; required; default `gen_random_uuid()`                | Unique identifier for this record.                    |
| `aircraft_id`    | `UUID`        | cross-FK → `aircraft(id)`; required                      | Related aircraft identifier.                          |
| `product_id`     | `UUID`        | FK → `stock_batch(id, product_id) (composite)`; required | Related onboard product identifier.                   |
| `stock_batch_id` | `UUID`        | FK → `stock_batch(id, product_id) (composite)`; required | Identifier of the related stock batch.                |
| `quantity`       | `INTEGER`     | required; CHECK                                          | Number of items involved.                             |
| `updated_at`     | `TIMESTAMPTZ` | required; default `now()`                                | Last modification timestamp (application-maintained). |

**Table-level SQL constraints:** `UNIQUE (aircraft_id, stock_batch_id)` · `FOREIGN KEY (stock_batch_id, product_id) REFERENCES stock_batch (id, product_id)`

**Cross-feature linkage:** `aircraft_id` → `aircraft(id)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-flight_report"></a>

### `flight_report`

Cabin-crew inventory/consumption report for a flight.

| Column                  | SQL type      | Constraints / linkage                                     | Meaning                                       |
| ----------------------- | ------------- | --------------------------------------------------------- | --------------------------------------------- |
| `id`                    | `UUID`        | PK; required; default `gen_random_uuid()`                 | Unique identifier for this record.            |
| `flight_id`             | `UUID`        | cross-FK → `flight(id)`; required; unique                 | Related dated flight identifier.              |
| `status`                | `TEXT`        | required; default `'submitted'`; Allowed: submitted, void | Current lifecycle status.                     |
| `submitted_by_staff_id` | `UUID`        | FK → `staff(id)`; required                                | Identifier of the related submitted by staff. |
| `submitted_at`          | `TIMESTAMPTZ` | required                                                  | Simulation clock.                             |
| `created_at`            | `TIMESTAMPTZ` | required; default `now()`                                 | Actual database creation timestamp.           |

**Cross-feature linkage:** `flight_id` → `flight(id)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-flight_report_line"></a>

### `flight_report_line`

Reconciles products loaded, served, sold, wasted, damaged, and remaining.

**Important behavior:** Remaining = initial − served − sold − wasted − damaged. Sold quantities must match paid sales, checked by backend.

| Column             | SQL type  | Constraints / linkage                     | Meaning                                            |
| ------------------ | --------- | ----------------------------------------- | -------------------------------------------------- |
| `id`               | `UUID`    | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                 |
| `flight_report_id` | `UUID`    | FK → `flight_report(id)`; required        | Identifier of the related flight report.           |
| `product_id`       | `UUID`    | FK → `product(id)`; required              | Related onboard product identifier.                |
| `initial_quantity` | `INTEGER` | required; CHECK                           | Beginning quantity for this product on the flight. |
| `served`           | `INTEGER` | required; default `0`; CHECK              | Complimentary units consumed.                      |
| `sold`             | `INTEGER` | required; default `0`; CHECK              | Units sold.                                        |
| `wasted`           | `INTEGER` | required; default `0`; CHECK              | Units wasted.                                      |
| `damaged`          | `INTEGER` | required; default `0`; CHECK              | Units damaged.                                     |
| `remaining`        | `INTEGER` | required; CHECK                           | Ending units after serving, sales and losses.      |

**Table-level SQL constraints:** `UNIQUE (flight_report_id, product_id)` · `CHECK (remaining = initial_quantity - served - sold - wasted - damaged)`

<a id="table-product_sale"></a>

### `product_sale`

Paid onboard product sales, with price and batch-cost snapshots.

**Important behavior:** One product per payment. Unit cost snapshot timing (at sale vs flight report) is an unresolved F12 question.

| Column              | SQL type        | Constraints / linkage                     | Meaning                                              |
| ------------------- | --------------- | ----------------------------------------- | ---------------------------------------------------- |
| `id`                | `UUID`          | PK; required; default `gen_random_uuid()` | Unique identifier for this record.                   |
| `flight_id`         | `UUID`          | cross-FK → `flight(id)`; required         | Related dated flight identifier.                     |
| `product_id`        | `UUID`          | FK → `product(id)`; required              | Related onboard product identifier.                  |
| `quantity`          | `INTEGER`       | required; CHECK                           | Number of items involved.                            |
| `unit_price_amount` | `NUMERIC(12,2)` | required; CHECK                           | Amount for unit price in the applicable currency.    |
| `unit_cost_amount`  | `NUMERIC(12,2)` | nullable; CHECK                           | Per-unit cost snapshot; timing pending F12 decision. |
| `total_amount`      | `NUMERIC(12,2)` | required; CHECK                           | Quantity multiplied by unit selling price.           |
| `currency`          | `TEXT`          | required                                  | Currency code associated with the amount.            |
| `payment_id`        | `UUID`          | required                                  | F5 payment reference; no database FK yet.            |
| `sold_at`           | `TIMESTAMPTZ`   | required                                  | Simulation clock.                                    |
| `created_at`        | `TIMESTAMPTZ`   | required; default `now()`                 | Actual database creation timestamp.                  |

**Table-level SQL constraints:** `UNIQUE (payment_id, product_id)` · `CHECK (total_amount = quantity * unit_price_amount)`

**Indexes:** `product_sale_flight_idx` (index; `(flight_id)`).

**Cross-feature linkage:** `flight_id` → `flight(id)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

<a id="table-stock_movement"></a>

### `stock_movement`

Immutable signed warehouse/aircraft inventory ledger entries.

**Important behavior:** Signed ledger; exactly one of warehouse_id and aircraft_id must be populated. Transfer creates an outgoing and incoming entry. Reserve/release affect reservations rather than physical stock.

| Column                | SQL type      | Constraints / linkage                                                   | Meaning                                                          |
| --------------------- | ------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `id`                  | `UUID`        | PK; required; default `gen_random_uuid()`                               | Unique identifier for this record.                               |
| `product_id`          | `UUID`        | FK → `product(id)`; required                                            | Related onboard product identifier.                              |
| `warehouse_id`        | `UUID`        | FK → `warehouse(id)`; nullable                                          | Location if warehouse; mutually exclusive with aircraft_id.      |
| `aircraft_id`         | `UUID`        | cross-FK → `aircraft(id)`; nullable                                     | Location if aircraft; mutually exclusive with warehouse_id.      |
| `stock_batch_id`      | `UUID`        | FK → `stock_batch(id)`; nullable                                        | Identifier of the related stock batch.                           |
| `stock_transfer_id`   | `UUID`        | FK → `stock_transfer(id)`; nullable                                     | Identifier of the related stock transfer.                        |
| `product_order_id`    | `UUID`        | FK → `product_order(id)`; nullable                                      | Reserve and release.                                             |
| `flight_id`           | `UUID`        | cross-FK → `flight(id)`; nullable                                       | Related dated flight identifier.                                 |
| `type`                | `TEXT`        | required; Allowed: receive, reserve, release, transfer, discard, adjust | Movement kind: receive/reserve/release/transfer/discard/adjust.  |
| `quantity`            | `INTEGER`     | required; CHECK                                                         | Signed change (non-zero); reserve/release apply to reservations. |
| `reason`              | `TEXT`        | nullable; Allowed: spoilage, damage, expired, count_correction          | Correction or spoilage/damage/expiry reason for movement.        |
| `note`                | `TEXT`        | nullable                                                                | Additional free-text note.                                       |
| `created_by_staff_id` | `UUID`        | FK → `staff(id)`; nullable                                              | NULL when the system made the change.                            |
| `occurred_at`         | `TIMESTAMPTZ` | required                                                                | Simulation time of movement.                                     |
| `created_at`          | `TIMESTAMPTZ` | required; default `now()`                                               | Actual database creation timestamp.                              |

**Table-level SQL constraints:** `CHECK (num_nonnulls(warehouse_id, aircraft_id) = 1)` · `CHECK (type <> 'adjust' OR reason IS NOT NULL)`

**Indexes:** `stock_movement_order_once_uq` (unique; `(product_order_id, product_id, type) WHERE type IN ('reserve', 'release')`); `stock_movement_product_idx` (index; `(product_id, occurred_at)`); `stock_movement_flight_idx` (index; `(flight_id) WHERE flight_id IS NOT NULL`).

**Cross-feature linkage:** `flight_id` → `flight(id)`; `aircraft_id` → `aircraft(id)`. Declared in Part 9; coordinate any decision to omit with Database Leads.

---

[← Database documentation home](../docs.md) · [Seed data](./seed-data.md) · [Relationships & migrations](./relationships-and-migrations.md) · [Decisions & maintenance](./decisions-and-maintenance.md)
