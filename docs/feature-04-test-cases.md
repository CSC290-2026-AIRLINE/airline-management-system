# Feature 4: Test cases (Pricing, fare rules & finance)

Group 12. Covers every endpoint and staff page of Feature 4, for all three members.

Fill in **Pass/Fail** as you run each case by hand. A blank means the case has not been run yet. All are blank in this version.

| Tester | Date | Branch / commit |
|--------|------|-----------------|
|        |      |                 |

## How to test

- **Base URL:** `http://localhost:8080/api`
- **Token:** sign in on staff-web (port 6161), copy the access token, and send it as `Authorization: Bearer <token>`. Every route needs it except `GET /seat-fees`.
- **Errors:** pricing errors look like `{ code, message, details? }`. DTO validation errors have no `code`: they are a 400 with `message` as a list. Where the Expected column says **400 (validation)**, that is the kind it means.
- **Soft delete:** a deleted row stays in the table with `deleted_at` set, but no longer appears in the API.
- **Paths:** below, `/staff/...` means `http://localhost:8080/api/staff/...`.

### Data to prepare

| Needed for | What | How |
|------------|------|-----|
| All pricing | Fare classes, at least one in economy | FC cases, or Fare Setup page |
| Quotes | A future flight with status `scheduled` or `delayed` | `SELECT id, flight_number, dep_at, status, route_id FROM flight WHERE dep_at > now();` |
| Quotes | A base fare of 100.00 on that flight's route | BF cases |
| Worked example | Only VAT 7% active, only the rules listed in FQ-01 active | Turn others off in the pages |
| Finance | Mock bills, expenses and report rows, if wanted | `docs/money_mock.md` |

**The quote worked example needs care.** Seats left is always 100% until Feature 3b exists (see [Known limits](#known-limits)), so a rule like "under 20% left" can never match a real flight. FQ-01 uses a load rule that covers 100% instead. The simulator lets you type the seats left, so SI-01 can use the normal rule.

## Fare classes

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| FC-01 | Create | `POST /staff/fare-classes` | `{"code":"T1","cabin":"economy","name":"Test Saver"}` | 201, row returned | |
| FC-02 | Duplicate code | Send FC-01 again | Same body | 409 `FARE_CLASS_CODE_TAKEN` | |
| FC-03 | Code format | `POST /staff/fare-classes` | `code: "t1"`, then `code: "ABCD"` | 400 (validation) both times | |
| FC-04 | Empty name | `POST /staff/fare-classes` | `name: ""` | 400 (validation) | |
| FC-05 | Bad cabin | `POST /staff/fare-classes` | `cabin: "vip"` | 400 (validation) | |
| FC-06 | Unknown field | `POST /staff/fare-classes` | FC-01 body plus `"foo":1` | 400 (validation) | |
| FC-07 | Rule on create | `POST /staff/fare-classes` | `refundable: false, cancel_fee_flat: 50` | 400 `FARE_RULE_INVALID`, `details.fields` has `cancel_fee_flat` | |
| FC-08 | Inactive hidden | PATCH a class to `is_active: false`, then `GET /staff/fare-classes` | None | Class is not listed | |
| FC-09 | Include inactive | `GET /staff/fare-classes?include_inactive=true` | None | Inactive class is listed | |
| FC-10 | Get one | `GET /staff/fare-classes/:id` | Unknown UUID, then `abc` | 404 `FARE_CLASS_NOT_FOUND`, then 400 | |
| FC-11 | Update | `PATCH /staff/fare-classes/:id` | `{"name":"New name"}` | 200, only the name changed | |
| FC-12 | Empty name on update | `PATCH /staff/fare-classes/:id` | `{"name":""}` | 400 (validation) | |
| FC-13 | Read rule | `GET /staff/fare-classes/:id/rule` | None | 200, restriction and fee fields | |
| FC-14 | Update rule | `PATCH /staff/fare-classes/:id/rule` | `{"refundable":true,"cancel_fee_flat":10,"cancel_fee_pct":5}` | 200, values saved | |
| FC-15 | Inconsistent rule | `PATCH /staff/fare-classes/:id/rule` | `{"changeable":false,"change_fee_pct":5}` | 400 `FARE_RULE_INVALID` | |
| FC-16 | Fee percent limit | `PATCH /staff/fare-classes/:id/rule` | `{"cancel_fee_pct":150}` | 400 (validation) | |
| FC-17 | Delete in use | `DELETE` a class with a live base fare | None | 409 `FARE_CLASS_IN_USE` | |
| FC-18 | Delete and reuse | `DELETE` a class with no base fares, `GET` it, then POST the same code | None | 204, then 404, then 201 | |

## Base fares

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| BF-01 | Route picker | `GET /staff/base-fares/route-options` | None | 200, routes with airport cities | |
| BF-02 | Create | `POST /staff/base-fares` | `{"route_id":"<id>","fare_class_id":"<id>","amount":100}` | 201 | |
| BF-03 | Duplicate | Send BF-02 again | Same body | 409 `BASE_FARE_EXISTS` | |
| BF-04 | Amount limits | `POST /staff/base-fares` | `amount: 0`, then `amount: 10.123` | 400 (validation) both times | |
| BF-05 | Unknown route | `POST /staff/base-fares` | Random `route_id` | 404 `ROUTE_NOT_FOUND` | |
| BF-06 | Deleted class | `POST /staff/base-fares` | Deleted class's `fare_class_id` | 404 `FARE_CLASS_NOT_FOUND` | |
| BF-07 | Filter | `GET /staff/base-fares?route_id=<id>` | None | Only that route's fares | |
| BF-08 | Update | `PATCH /staff/base-fares/:id` | `{"amount":120}` | 200, new amount | |
| BF-09 | Only amount changes | `PATCH /staff/base-fares/:id` | `{"route_id":"<id>"}` | 400 (validation) | |
| BF-10 | Delete | `DELETE`, then `GET` the same id | None | 204, then 404 `BASE_FARE_NOT_FOUND` | |

## Pricing settings

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| ST-01 | Read | `GET /staff/settings` | None | Both `quote_hold_minutes` and `base_currency`, even if not seeded | |
| ST-02 | Update hold | `PUT /staff/settings/quote_hold_minutes` | `{"value":"30"}` | 200, value `30`, `updated_by` set | |
| ST-03 | Bad values | `PUT /staff/settings/quote_hold_minutes` | `"0"`, `"abc"`, `"1441"`, `"1.5"` | 400 `SETTING_INVALID` each time | |
| ST-04 | Largest value | `PUT /staff/settings/quote_hold_minutes` | `{"value":"1440"}` | 200 | |
| ST-05 | Value must be text | `PUT /staff/settings/quote_hold_minutes` | `{"value":30}` | 400 (validation) | |
| ST-06 | Base currency locked | `PUT /staff/settings/base_currency` | `{"value":"USD"}` | 409 `SETTING_READ_ONLY` | |
| ST-07 | Unknown key | `PUT /staff/settings/foo` | `{"value":"1"}` | 404 `SETTING_NOT_FOUND` | |

Set `quote_hold_minutes` back to `15` afterwards.

## Pricing rules

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| PR-01 | Urgency rule | `POST /staff/pricing-rules` | `{"rule_group":"urgency","name":"H-7","min_days_out":4,"max_days_out":7,"adjustment_pct":10}` | 201, priority at the end of the group | |
| PR-02 | Load rule | `POST /staff/pricing-rules` | `{"rule_group":"load","name":"Low","max_seats_left_pct":20,"adjustment_pct":15}` | 201 | |
| PR-03 | Month rule | `POST /staff/pricing-rules` | `{"rule_group":"month","name":"Dec","month":12,"adjustment_pct":5}` | 201 | |
| PR-04 | Period rule | `POST /staff/pricing-rules` | `{"rule_group":"period","name":"NY","start_date":"2026-12-28","end_date":"2027-01-03","adjustment_pct":8}` | 201 | |
| PR-05 | Wrong group's field | `POST /staff/pricing-rules` | `{"rule_group":"urgency","name":"x","min_days_out":1,"month":5,"adjustment_pct":1}` | 400 `PRICING_RULE_INVALID`, `details.fields` has `month` | |
| PR-06 | No condition | `POST /staff/pricing-rules` | Urgency rule with no days, then load with no seats | 400 `PRICING_RULE_INVALID` both times | |
| PR-07 | Min above max | `POST /staff/pricing-rules` | `min_days_out: 8, max_days_out: 2` | 400 `PRICING_RULE_INVALID` | |
| PR-08 | Month missing or wrong | `POST /staff/pricing-rules` | Month rule with no `month`, then `month: 13` | 400 `PRICING_RULE_INVALID`, then 400 (validation) | |
| PR-09 | Period dates | `POST /staff/pricing-rules` | `start_date` after `end_date` | 400 `PRICING_RULE_INVALID` | |
| PR-10 | Adjustment limit | `POST /staff/pricing-rules` | `adjustment_pct: -100` | 400 (validation) | |
| PR-11 | Priority taken | `POST /staff/pricing-rules` | Priority already used in that group | 409 `PRICING_RULE_PRIORITY_TAKEN` | |
| PR-12 | Unknown class | `POST /staff/pricing-rules` | Random `fare_class_id` | 404 `FARE_CLASS_NOT_FOUND` | |
| PR-13 | Update | `PATCH /staff/pricing-rules/:id` | `{"adjustment_pct":12}` | 200 | |
| PR-14 | Group rules on update | `PATCH` a month rule | `{"month":null}` | 400 `PRICING_RULE_INVALID` | |
| PR-15 | Reorder | `POST /staff/pricing-rules/reorder` | `{"rule_group":"urgency","ids":[all live ids, new order]}` | 200, priorities 1, 2, 3… in that order, no unique index error | |
| PR-16 | Reorder mismatch | `POST /staff/pricing-rules/reorder` | Leave one live id out | 400 `PRICING_RULE_REORDER_MISMATCH`, `details.missing` set | |
| PR-17 | Delete | `DELETE`, then `GET` the same id | None | 204, then 404 `PRICING_RULE_NOT_FOUND` | |

## Price simulator

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| SI-01 | Worked example | Active: PR-01, PR-02, 7% tax, 5.00 flat surcharge. `POST /staff/pricing-rules/simulate` | `{"base_fare":100,"departure_date":"<7 days from today>","seats_left_pct":15,"seat_type":"normal"}` | Lines +10.00, +16.50, tax 8.86, surcharge 5.00. Total **140.36** | |
| SI-02 | First match wins | Two urgency rules that both match, then swap their order | Same as SI-01 | Only the first rule in order appears | |
| SI-03 | Inactive rule | Turn PR-01 off | Same as SI-01 | No H-7 line, `urgency` in `unmatched_groups` | |
| SI-04 | Class-only rule | Set `fare_class_id` on a matching rule | Same as SI-01 | Rule is skipped: the simulator has no fare class | |
| SI-05 | Seat fee | Economy exit row fee exists | `seat_type: "exit_row"` | Fee line appears before tax | |
| SI-06 | Percent promo | Live code, 15% off | SI-01 plus `promo_code` | Promo line −18.98 with detail `15%`, tax on the discounted price, total 120.05 | |
| SI-07 | Fixed promo | Live code, 20 off | SI-01 plus `promo_code` | Promo line −20.00 with detail `flat` | |
| SI-08 | Unusable promo | Expired code | SI-01 plus `promo_code` | 422 `PROMO_INVALID` | |
| SI-09 | Past departure | `POST /staff/pricing-rules/simulate` | Yesterday's date | 400 `SIMULATION_INVALID` | |
| SI-10 | Seats limit | `POST /staff/pricing-rules/simulate` | `seats_left_pct: 101` | 400 (validation) | |
| SI-11 | Dry run | Count `fare_quote` rows and note the promo's `used_count`, run SI-06, check again | None | Nothing changed | |

## Promo codes

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| PC-01 | Percent code | `POST /staff/promo-codes` | `{"code":"SAVE10","kind":"promo","discount_pct":10,"valid_from":"2026-01-01T00:00:00+07:00","valid_to":"2027-12-31T00:00:00+07:00"}` | 201, `used_count` 0 | |
| PC-02 | Fixed code | `POST /staff/promo-codes` | `code: "MINUS20", discount_amount: 20`, no `discount_pct` | 201 | |
| PC-03 | Both or neither discount | `POST /staff/promo-codes` | Both discounts, then neither | 400 `PROMO_CODE_INVALID` both times | |
| PC-04 | Dates | `POST /staff/promo-codes` | `valid_from` after `valid_to` | 400 `PROMO_CODE_INVALID` | |
| PC-05 | No timezone | `POST /staff/promo-codes` | `valid_from: "2026-11-01T00:00:00"` | 400 (validation) | |
| PC-06 | Code format | `POST /staff/promo-codes` | `code: "save10"` | 400 (validation) | |
| PC-07 | Duplicate | Send PC-01 again | Same body | 409 `PROMO_CODE_TAKEN` | |
| PC-08 | Used count locked | `POST /staff/promo-codes` | PC-01 body plus `used_count: 5` | 400 (validation) | |
| PC-09 | Switch discount type | `PATCH /staff/promo-codes/:id` | `{"discount_pct":null,"discount_amount":50}` | 200 | |
| PC-10 | Max uses too low | Code with 3 uses, then `PATCH` | `{"max_uses":2}` | 400 `PROMO_CODE_INVALID` | |
| PC-11 | List | `GET /staff/promo-codes`, then `?include_inactive=true` | None | Inactive codes appear only the second time | |
| PC-12 | Delete and reuse | `DELETE`, `GET` it, then POST the same code | None | 204, 404 `PROMO_CODE_NOT_FOUND`, 201 | |
| PC-13 | Quotes for a code | `GET /staff/promo-codes/quotes?code=SAVE10` | None | 200, newest first, at most 50, with flight and route | |
| PC-14 | Quotes, unknown code | `GET /staff/promo-codes/quotes?code=NOPE` | None | 404 `PROMO_CODE_NOT_FOUND` | |
| PC-15 | Quotes, no code | `GET /staff/promo-codes/quotes` | None | 400 (validation) | |

## Fare quotes

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| FQ-01 | **Worked example** | Base fare 100. Active only: an urgency rule +10% matching the flight's days out, a load rule +15% with `max_seats_left_pct: 100`, VAT 7%, and SAVE10. `POST /fare-quotes` | `{"flight_id":"<id>","fare_class_id":"<id>","promo_code":"SAVE10"}` | 201. 100.00 → 110.00 → 126.50 → 113.85 → **121.82**. Lines: +10.00, +16.50, −12.65, +7.97 | |
| FQ-02 | Lines add up | Add up the FQ-01 lines | None | The sum equals `total_amount` exactly | |
| FQ-03 | Saved facts | `GET /fare-quotes/:id` | None | Same lines, `currency`, `expires_at` = `quoted_at` + hold minutes | |
| FQ-04 | Unknown quote | `GET /fare-quotes/:id` | Random UUID | 404 `FARE_QUOTE_NOT_FOUND` | |
| FQ-05 | Reuse inside window | Send FQ-01 again | Same body | Same quote `id`, no new row | |
| FQ-06 | Different key | Send FQ-01 with a different promo or `seat_type` | Changed body | New quote `id` | |
| FQ-07 | After expiry | Set hold to 1 minute, make a quote, wait over 1 minute, send it again | Same body | New quote `id` | |
| FQ-08 | Seat fee | Seat fee exists for that cabin | `seat_type: "exit_row"` | `Seat fee (exit_row)` line before the promo | |
| FQ-09 | No seat fee row | No fee for that cabin and seat type | `seat_type: "extra_legroom"` | 404 `SEAT_FEE_NOT_FOUND` | |
| FQ-10 | Quote is frozen | After FQ-01, change VAT and the base fare, then `GET /fare-quotes/:id` | None | Old lines and total unchanged | |
| FQ-11 | Unknown flight | `POST /fare-quotes` | Random `flight_id` | 404 `FLIGHT_NOT_FOUND` | |
| FQ-12 | Not bookable | Flight status `cancelled`, or already departed | That `flight_id` | 409 `FLIGHT_NOT_BOOKABLE` | |
| FQ-13 | Check beats reuse | Make a quote, cancel the flight, send it again inside the window | Same body | 409 `FLIGHT_NOT_BOOKABLE`, not the saved quote | |
| FQ-14 | Inactive class | Turn the fare class off | Same body | 404 `FARE_CLASS_NOT_FOUND` | |
| FQ-15 | Advance purchase | Set `min_advance_purchase_days` above the flight's days out | Same body | 422 `ADVANCE_PURCHASE_REQUIRED`, with both day counts in `details` | |
| FQ-16 | No base fare | Fare class with no base fare on that route | That `fare_class_id` | 422 `BASE_FARE_MISSING` | |
| FQ-17 | Promo: unknown | `POST /fare-quotes` | `promo_code: "NOPE"` | 422 `PROMO_INVALID`, `details.reason: "unknown"` | |
| FQ-18 | Promo: expired | `POST /fare-quotes` | Code past `valid_to` | 422 `PROMO_INVALID`, reason `expired` | |
| FQ-19 | Promo: not yet valid | `POST /fare-quotes` | Code before `valid_from` | 422 `PROMO_INVALID`, reason `not_yet_valid` | |
| FQ-20 | Promo: inactive | `POST /fare-quotes` | Inactive code | 422 `PROMO_INVALID`, reason `inactive` | |
| FQ-21 | Promo: used up | `POST /fare-quotes` | `used_count` = `max_uses` | 422 `PROMO_INVALID`, reason `exhausted` | |
| FQ-22 | Promo as typed | `POST /fare-quotes` | `promo_code: " save10 "` | Accepted, same as `SAVE10` | |
| FQ-23 | Bad input | `POST /fare-quotes` | `flight_id: "abc"`, then `seat_type: "aisle"` | 400 (validation) both times | |

### Cancel and change fees

Use a class with `refundable: true`, `cancel_fee_flat: 10`, `cancel_fee_pct: 5`, and the 121.82 quote.

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| FE-01 | Cancel fee | `GET /fare-quotes/:id/fee?type=cancel` | None | `allowed: true`, `fee: 16.09` (10.00 + 5% of 121.82) | |
| FE-02 | Not allowed | Same, on a quote from a non-refundable class | None | `allowed: false`, `fee: null` | |
| FE-03 | Change fee | `GET /fare-quotes/:id/fee?type=change` | None | Uses the change fee fields | |
| FE-04 | Capped at the total | Quote from a class with `cancel_fee_flat: 500` | `type=cancel` | `fee` equals the quote total | |
| FE-05 | Uses the snapshot | Change the live class's fees, repeat FE-01 | None | Fee unchanged | |
| FE-06 | Bad type | `GET /fare-quotes/:id/fee?type=refund` | None | 400 (validation) | |
| FE-07 | Unknown quote | `GET /fare-quotes/:id/fee?type=cancel` | Random UUID | 404 `FARE_QUOTE_NOT_FOUND` | |

### Promo redemption

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| RD-01 | First redeem | `POST /fare-quotes/:id/redeem` on a promo quote | None | 200, `redeemed: true`, `already_redeemed: false`, `used_count` up by 1 | |
| RD-02 | Redeem twice | Send RD-01 again | None | 200, `already_redeemed: true`, `used_count` unchanged | |
| RD-03 | No promo | Redeem a quote with no promo | None | 200, `redeemed: false`, `promo_code_id: null` | |
| RD-04 | Last use taken | Code with `max_uses: 1`, two quotes (different seat type). Redeem both | None | First 200, second 422 `PROMO_INVALID`, reason `exhausted`. `used_count` stays 1 | |
| RD-05 | Switched off later | Make a quote, turn the promo off, redeem | None | 200, counted: the price was already agreed | |
| RD-06 | Unknown quote | `POST /fare-quotes/:id/redeem` | Random UUID | 404 `FARE_QUOTE_NOT_FOUND` | |

## Seat fees

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| SF-01 | Create | `POST /staff/seat-fees` | `{"cabin":"economy","seat_type":"exit_row","amount":300}` | 201 | |
| SF-02 | Duplicate | Send SF-01 again | Same body | 409 `SEAT_FEE_EXISTS` | |
| SF-03 | Bad values | `POST /staff/seat-fees` | `amount: -1`, then `cabin: "vip"`, then `seat_type: "aisle"` | 400 (validation) each time | |
| SF-04 | Public lookup | `GET /seat-fees?cabin=economy&seat_type=exit_row` with **no token** | None | 200, the fee | |
| SF-05 | Lookup, no row | `GET /seat-fees?cabin=first&seat_type=exit_row` | None | 404 `SEAT_FEE_NOT_FOUND` | |
| SF-06 | Lookup, bad value | `GET /seat-fees?cabin=vip&seat_type=exit_row` | None | 400 (validation) | |
| SF-07 | Update to a taken pair | `PATCH` another economy row | `{"seat_type":"exit_row"}` | 409 `SEAT_FEE_EXISTS` | |
| SF-08 | Update amount | `PATCH /staff/seat-fees/:id` | `{"amount":350}` | 200 | |
| SF-09 | Delete and re-add | `DELETE`, `GET` it, then send SF-01 | None | 204, 404 `SEAT_FEE_NOT_FOUND`, 201 | |

## Taxes, surcharges and fees

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| TF-01 | Percent tax | `POST /staff/tax-fees` | `{"code":"VAT","name":"VAT","kind":"tax","calc_type":"pct","value":7}` | 201 | |
| TF-02 | Flat fee | `POST /staff/tax-fees` | `{"code":"APT_FEE","name":"Airport fee","kind":"fee","calc_type":"flat","value":700}` | 201 | |
| TF-03 | Code format | `POST /staff/tax-fees` | `code: "vat"` | 400 (validation) | |
| TF-04 | Percent limit | `POST /staff/tax-fees` | `calc_type: "pct", value: 150` | 400 `TAX_FEE_PCT_TOO_HIGH` | |
| TF-05 | Limit on update | `PATCH` APT_FEE | `{"calc_type":"pct"}` | 400 `TAX_FEE_PCT_TOO_HIGH` (700 is over 100) | |
| TF-06 | Duplicate | Send TF-01 again | Same body | 409 `TAX_FEE_CODE_TAKEN` | |
| TF-07 | Bad kind | `POST /staff/tax-fees` | `kind: "levy"` | 400 (validation) | |
| TF-08 | Inactive hidden | Turn VAT off, `GET /staff/tax-fees`, then `?include_inactive=true` | None | Listed only the second time | |
| TF-09 | Inactive not charged | With VAT off, simulate a price | None | No VAT line | |
| TF-10 | Delete and reuse | `DELETE`, `GET` it, then POST the same code | None | 204, 404 `TAX_FEE_NOT_FOUND`, 201 | |

## Overweight baggage

Use a default rate with allowance 20 kg, rate 100 per kg, maximum 32 kg.

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| BG-01 | Default rate | `POST /staff/baggage-rates` | `{"fare_class_id":"<id>","free_allowance_kg":20,"rate_per_kg":100,"max_bag_kg":32}` | 201, `route_id` null | |
| BG-02 | Route override | `POST /staff/baggage-rates` | BG-01 plus `route_id`, `rate_per_kg: 150` | 201 | |
| BG-03 | Duplicate default | Send BG-01 again | Same body | 409 `BAGGAGE_RATE_EXISTS` | |
| BG-04 | Duplicate override | Send BG-02 again | Same body | 409 `BAGGAGE_RATE_EXISTS` | |
| BG-05 | Allowance vs maximum | `POST /staff/baggage-rates` | `free_allowance_kg: 32, max_bag_kg: 32` | 400 `BAGGAGE_RATE_INVALID` | |
| BG-06 | Unknown class | `POST /staff/baggage-rates` | Random `fare_class_id` | 404 `FARE_CLASS_NOT_FOUND` | |
| BG-07 | Unknown route | `POST /staff/baggage-rates` | Random `route_id` | 404 `ROUTE_NOT_FOUND` | |
| BG-08 | Bad values | `POST /staff/baggage-rates` | `rate_per_kg: -1`, then `free_allowance_kg: 20.55` | 400 (validation) both times | |
| BG-09 | Filter | `GET /staff/baggage-rates?fare_class_id=<id>` | None | Only that class | |
| BG-10 | Charge, under | `GET /baggage-charge?fare_class_id=<id>&weight_kg=19` | None | `charge: 0` | |
| BG-11 | Charge, at allowance | Same | `weight_kg=20` | `charge: 0` | |
| BG-12 | Charge, just over | Same | `weight_kg=20.1` | `chargeable_kg: 1`, `charge: 100` | |
| BG-13 | Charge, whole kg | Same | `weight_kg=25` | `charge: 500` | |
| BG-14 | Charge, rounds up | Same | `weight_kg=25.4` | `chargeable_kg: 6`, `charge: 600` | |
| BG-15 | Charge, at maximum | Same | `weight_kg=32` | `charge: 1200` | |
| BG-16 | Too heavy | Same | `weight_kg=33` | 422 `BAGGAGE_TOO_HEAVY` | |
| BG-17 | Override wins | Same, plus `route_id` of BG-02 | `weight_kg=25` | `charge: 750` | |
| BG-18 | Falls back to default | Same, with another `route_id` | `weight_kg=25` | `charge: 500` | |
| BG-19 | No rate | Class with no rate | `weight_kg=25` | 404 `BAGGAGE_RATE_NOT_FOUND` | |
| BG-20 | Bad weight | Same | `weight_kg=0`, then `abc` | 400 (validation) both times | |
| BG-21 | No limit | Rate with `max_bag_kg: null` | `weight_kg=100` | Charged, not refused | |
| BG-22 | Inactive rate | Turn the override off | BG-17 | Uses the default: `charge: 500` | |
| BG-23 | Delete and re-add | `DELETE`, `GET` it, then send BG-01 | None | 204, 404 `BAGGAGE_RATE_NOT_FOUND`, 201 | |

## Currency rates

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| CR-01 | Create | `POST /staff/currency-rates` | `{"currency_code":"USD","rate_per_base":0.028}` | 201, `updated_by` is the signed-in staff member | |
| CR-02 | Code format | `POST /staff/currency-rates` | `usd`, then `USDT` | 400 (validation) both times | |
| CR-03 | Base currency | `POST /staff/currency-rates` | `currency_code: "THB"` | 400 `CURRENCY_IS_BASE` | |
| CR-04 | Rate limit | `POST /staff/currency-rates` | `rate_per_base: 0` | 400 (validation) | |
| CR-05 | Duplicate | Send CR-01 again | Same body | 409 `CURRENCY_CODE_TAKEN` | |
| CR-06 | Staff can't set the editor | `POST /staff/currency-rates` | CR-01 body plus `updated_by` | 400 (validation) | |
| CR-07 | List and get | `GET /staff/currency-rates`, then `/USD` | None | 200, with the staff member's name | |
| CR-08 | Update | `PATCH /staff/currency-rates/USD` | `{"rate_per_base":0.03}` | 200, new rate | |
| CR-09 | Unknown code | `GET /staff/currency-rates/EUR` | None | 404 `CURRENCY_RATE_NOT_FOUND` | |
| CR-10 | Malformed code | `GET /staff/currency-rates/eur` | None | 400 | |

## Payment schedules

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| PS-01 | Create | `POST /staff/payment-schedules` | `{"category":"maintenance","payee":"Skyline Hangars","description":"Hangar rent","amount":24500,"due_date":"2026-12-01"}` | 201, `status: "scheduled"`, `paid_on: null` | |
| PS-02 | No description | `POST /staff/payment-schedules` | PS-01 without `description` | 201 | |
| PS-03 | Payee required | `POST /staff/payment-schedules` | `payee: ""` | 400 (validation) | |
| PS-04 | Amount limit | `POST /staff/payment-schedules` | `amount: 0` | 400 (validation) | |
| PS-05 | Bad category | `POST /staff/payment-schedules` | `category: "fuel"` | 400 (validation) | |
| PS-06 | Bad dates | `POST /staff/payment-schedules` | `2026-02-30`, then `2026-12-01T10:00:00Z` | 400 (validation) both times | |
| PS-07 | Status locked | `POST /staff/payment-schedules` | PS-01 plus `status: "paid"` | 400 (validation) | |
| PS-08 | List | `GET /staff/payment-schedules` | None | Soonest due first | |
| PS-09 | Filters | `?status=paid`, then `?overdue=true` | None | Paid bills, then unpaid bills due before today | |
| PS-10 | Filters combined | `?status=paid&overdue=true` | None | 200, empty list | |
| PS-11 | Update unpaid | `PATCH /staff/payment-schedules/:id` | `{"amount":25000}` | 200 | |
| PS-12 | Delete unpaid | `DELETE`, then `GET` the same id | None | 204, then 404 `PAYMENT_SCHEDULE_NOT_FOUND` | |
| PS-13 | Mark paid | `POST /staff/payment-schedules/:id/pay` | None | 200, `status: "paid"`, `paid_on` today, with the new expense | |
| PS-14 | Expense matches | Open the expense from PS-13 | None | Same amount and category, `Payee: description`, `incurred_on` = `paid_on` | |
| PS-15 | Pay twice | Send PS-13 again | None | 409 `PAYMENT_SCHEDULE_PAID`, still one expense | |
| PS-16 | Paid is locked | `PATCH`, then `DELETE` the paid bill | `{"amount":1}` | 409 `PAYMENT_SCHEDULE_PAID` both times | |
| PS-17 | Unknown bill | `POST /staff/payment-schedules/:id/pay` | Random UUID | 404 `PAYMENT_SCHEDULE_NOT_FOUND` | |

## Expenses

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| EX-01 | Create | `POST /staff/expenses` | `{"category":"catering","description":"Meals","amount":8600,"incurred_on":"2026-10-06"}` | 201, `payment_schedule_id: null` | |
| EX-02 | Description required | `POST /staff/expenses` | `description: ""` | 400 (validation) | |
| EX-03 | Amount limit | `POST /staff/expenses` | `amount: 0` | 400 (validation) | |
| EX-04 | Bad date | `POST /staff/expenses` | `incurred_on: "2026-02-30"` | 400 (validation) | |
| EX-05 | Can't link a bill | `POST /staff/expenses` | EX-01 plus `payment_schedule_id` | 400 (validation) | |
| EX-06 | Filter | `GET /staff/expenses?month=2026-10&category=catering` | None | Only that month and category | |
| EX-07 | Bad filter | `?month=2026-13`, then `?category=fuel` | None | 400 (validation) both times | |
| EX-08 | Update manual | `PATCH /staff/expenses/:id` | `{"amount":9000}` | 200 | |
| EX-09 | Delete manual | `DELETE`, then `GET` the same id | None | 204, then 404 `EXPENSE_NOT_FOUND` | |
| EX-10 | Bill's expense is locked | `PATCH`, then `DELETE` an expense from PS-13 | `{"amount":1}` | 409 `EXPENSE_FROM_SCHEDULE` both times | |

## Monthly summary

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| FS-01 | Recompute | Expenses in one month: maintenance 1,000, staff 500. `POST /staff/finance/summary/2026-10/recompute` | None | 200, those cost columns, `profit_amount` = −(sum of the month's costs) while revenue is 0 | |
| FS-02 | Run again | Send FS-01 again | None | Same numbers, still one row for the month | |
| FS-03 | Month edges | Expenses on the last day of September and the first day of November | None | Neither counts in October | |
| FS-04 | Deleted expense | Delete an expense, recompute | None | Its amount is gone | |
| FS-05 | Read one month | `GET /staff/finance/summary?month=2026-10` | None | 200, the row | |
| FS-06 | Not computed | `GET /staff/finance/summary?month=2020-01` | None | 404 `FINANCE_SUMMARY_NOT_FOUND` | |
| FS-07 | Read a range | `?from=2026-06&to=2026-10` | None | Oldest first, computed months only | |
| FS-08 | Range backwards | `?from=2026-10&to=2026-06` | None | 400 `FINANCE_SUMMARY_QUERY_INVALID` | |
| FS-09 | Wrong mix | No query, then `?month=2026-10&from=2026-01&to=2026-02` | None | 400 `FINANCE_SUMMARY_QUERY_INVALID` both times | |
| FS-10 | Malformed month | `POST /staff/finance/summary/2026-13/recompute` | None | 400 | |

## Sign-in

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| AU-01 | Staff route, no token | `GET /staff/fare-classes` with no token | None | 401 | |
| AU-02 | Quote route, no token | `POST /fare-quotes` with no token | FQ-01 body | 401 | |
| AU-03 | Baggage charge, no token | `GET /baggage-charge?...` with no token | None | 401 | |
| AU-04 | Signed in, not staff | Use a token from customer-web, `PUT /staff/settings/quote_hold_minutes` | `{"value":"20"}` | 403 `STAFF_NOT_FOUND`, value unchanged | |

## Staff pages

Run in staff-web on port 6161 against the real backend. Repeat the starred (★) cases at phone width (under 800px).

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| UI-01 | Sidebar ★ | Open each page from the menu | None | Fare Setup, Pricing Rules, Taxes Currency & Promos, Expenses & Payments, Monthly Report all open | |
| UI-02 | Fare classes ★ | Fare Setup: add a class, edit it, remove it | Valid values | List updates each time, remove asks for confirmation | |
| UI-03 | Fare class errors | Add a class with an empty name, then a taken code | Bad values | Field shows Required, then the taken-code message | |
| UI-04 | Base fares ★ | Fare Setup → Base fares: pick a route, edit a price, save | New amount | Saved and still there after a refresh | |
| UI-05 | Rules ★ | Pricing Rules: open each of the 4 groups, add and remove a rule | Valid values | Form shows only that group's fields, counts update | |
| UI-06 | Rule order | Move a rule up and down | None | New order stays after a refresh | |
| UI-07 | Seat fees | Pricing Rules: change a seat fee and save | New amount | Saved, simulator follows it | |
| UI-08 | Simulator ★ | Open Price simulator, change the inputs | Valid values | Price recalculates shortly after typing stops | |
| UI-09 | Simulator promo | Open the Promo code dropdown | None | Lists only codes usable right now | |
| UI-10 | Simulator promo price | Pick a promo | None | Promo line above the taxes, total drops | |
| UI-11 | Page order ★ | Open Taxes, Currency & Promos | None | Settings, Taxes, Currency, Baggage, Promo codes, Redeem | |
| UI-12 | Settings ★ | Change the hold window and press Save settings | `30` | "Settings saved", base currency cannot be edited | |
| UI-13 | Settings errors | Enter a bad value and save | `0`, `abc`, `1441` | "A whole number from 1 to 1440" | |
| UI-14 | Save unchanged | Leave the hold window as it is | None | Save settings is disabled | |
| UI-15 | Taxes ★ | Add, edit and turn off a tax | Valid values | List updates | |
| UI-16 | Currency ★ | Change a rate and save, add a currency | Valid values | Saved, example amount follows | |
| UI-17 | Baggage ★ | Add a default and a route override | Valid values | Both listed | |
| UI-18 | Promo codes ★ | Add a code, switch it off | Valid values | Status updates | |
| UI-19 | Redeem search ★ | Redeem a promo: enter a code, press Find quotes | Code with quotes | Quotes listed with flight, route and price | |
| UI-20 | Redeem | Press Redeem on a quote | None | Shows Redeemed, Uses column in the promo table goes up | |
| UI-21 | Redeem errors | Search an empty box, an unknown code, a code with no quotes | None | "Enter a promo code", not-found message, "No quotes use … yet." | |
| UI-22 | Month picker ★ | Expenses & Payments: change the month | None | Cost cards and expenses follow | |
| UI-23 | Record expense ★ | Press + Record expense, fill it in | Valid values | Dialog closes, "Expense recorded", list and cards update | |
| UI-24 | Expense in another month | Record one dated in another month | Other month's date | Says which month it went to | |
| UI-25 | Add bill ★ | Press + Add bill, fill it in | Valid values | Dialog closes, "Bill added: …", bill is Scheduled | |
| UI-26 | Add bill errors | Submit empty, then fill in one field at a time | None | Payee, category, amount and due date messages in turn | |
| UI-27 | Overdue bill | Add a bill with a past due date | Past date | Shows Overdue | |
| UI-28 | Mark paid ★ | Press Mark paid | None | Bill shows Paid, expense appears above | |
| UI-29 | Monthly report ★ | Open Monthly Report | None | Shows this month and the 4 before it, with a total | |
| UI-30 | Still to pay | Bill due this month, open Monthly Report | None | Listed under Still to pay | |
| UI-31 | Recompute | Press Recompute summary | None | "Recomputed just now…", costs match the expenses (see [Known limits](#known-limits)) | |
| UI-32 | Backend down | Stop the backend and open each page | None | An error with Retry, not a blank page | |

## Covered by unit tests only

These can't be set up by hand reliably. Run `npm test -w apps/backend` and record the result here.

| ID | Feature | Steps | Input | Expected | Pass/Fail |
|----|---------|-------|-------|----------|-----------|
| UT-01 | Seats unavailable | `fare-quote.service.spec.ts` | Seat lookup throws or returns a bad number | 502 `UPSTREAM_UNAVAILABLE`, nothing saved | |
| UT-02 | Days to departure | `fare-quote.service.spec.ts` | Across midnight, in the origin airport's timezone | Calendar days, not hours ÷ 24 | |
| UT-03 | Reuse window | `fare-quote.service.spec.ts` | Quote lookup | Checks both `quoted_at <= now` and `expires_at > now`, so a rewound clock can't revive an old quote | |
| UT-04 | No use left at redeem | `fare-quote.service.spec.ts` | The conditional update counts nothing | 422 `PROMO_INVALID`, redemption rolled back | |
| UT-05 | Two identical requests | `fare-quote.service.spec.ts` | Another request saves first | Returns that quote, no second row | |
| UT-06 | Currency conversion | `currency-rate.service.spec.ts` | `convert()` | Rounded half up to 2 decimals | |
| UT-07 | Rule engine | `pricing-rule.engine.spec.ts` | No rules, all groups, class-only, inactive | Group order, first match wins | |

## Known limits

Don't record these as failures. They depend on work outside Feature 4, or are open decisions.

| Limit | Effect on testing | Waiting on |
|-------|-------------------|------------|
| Seats left is always 100% | Load rules can't match a nearly full flight on real quotes. `UPSTREAM_UNAVAILABLE` can't happen live. | Feature 3b |
| Simulation clock isn't connected | Quotes, promos and finance use real time | Platform |
| Revenue, refunds and pass-through are 0 | **Recompute overwrites them with 0**, so mock revenue from `docs/money_mock.md` is lost and profit shows as a loss | Features 5a and 5b |
| One promo use per quote | Shared quotes mean `used_count` can undercount when two bookings use one quote | DB team and 3b |
| Redeem card is by hand | Staff redeem from the page until 3b does it on booking | Feature 3b |
| Customers on staff routes | The Member A guide flags that the auth guard doesn't check user type. No case here until it's decided. | Dev Leads |
| Finance base currency | `currency-rate.service.ts` has `THB` hardcoded instead of reading settings | Member B |
| Base currency seed | `seed.ts` now adds both settings, pending the DB team's agreement | DB team |
| Feature 4 seed data | Fare classes, seat fees, taxes, baggage rates and promos aren't seeded, so test data is added by hand | Member C |
