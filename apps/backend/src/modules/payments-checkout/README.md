# Feature 5a — checkout and payment state

The payment module the selling features (3 booking, 6 excess baggage, 12 onboard sale, 17 cargo) call when a customer
buys something, and the REST surface the two frontends read.

**This is the mock.** The database is not ready, so nothing here talks to Prisma: the rows live in a `Map` behind
`PAYMENT_REPOSITORY`, and the provider is a fake one behind `PAYMENT_GATEWAY`. Both seams are one line in
`payments-checkout.module.ts`; when the real implementations land, nothing else in the module changes.

Every mock spot carries a `TODO(F5a)` saying what replaces it.

## How another backend module calls it

Import `PaymentsCheckoutModule` and inject `PaymentsCheckoutService`. There is no HTTP hop between modules — a selling
feature holds the service and calls it in process.

```ts
import { PaymentsCheckoutModule } from '@backend/modules/payments-checkout/payments-checkout.module'
import { PaymentsCheckoutService, type CreatePaymentInput } from '@backend/modules/payments-checkout/payments-checkout.service'

@Module({ imports: [PaymentsCheckoutModule] })
export class BookingsModule {}
```

### 1. Create the payment

```ts
const payment = await this.payments.createPayment({
  source_feature: 3, // 3 booking | 6 excess baggage | 12 onboard | 17 cargo
  purchase_ref: `booking:${booking.id}`, // the seller's own key for what is bought
  payer_customer_id: customer.id,
  idempotency_key: `booking:${booking.id}:checkout`, // replaying it returns the same payment
  amount_total: 705.0, // 5a never prices — the seller passes the number in
  voucher_amount: 0, // the share a Feature 5b voucher covers; miles are not money
  lines: [
    // one line per coupon, at its price_total
    { line_type: 'fare', description: 'Fare, 2 adults', amount: 624.0, booking_coupon_id: coupon.id },
    { line_type: 'seat_fee', description: 'Seat selection', amount: 36.0 },
    { line_type: 'baggage', description: 'Extra baggage', amount: 45.0 },
  ],
  expires_at: holdExpiresAt, // the booking's hold end
})
```

What the service checks:

- the lines must add up to `amount_total`
- `amount_total = voucher_amount + card_amount`
- a zero-cash payment is only allowed for a flight booking, and it gets `provider: 'none'`
- features 3 and 6 need a `booking_id`; feature 17 needs a `cargo_booking_id`
- `expires_at` must be after `started_at`
- the same `idempotency_key` returns the payment that already exists instead of creating a second one
- a second *live* payment for the same `purchase_ref` is refused, so a customer cannot pay twice

### 2. Confirm and settle

The customer has approved the payment but the booking is not final yet, so the seller asks Feature 5 to settle it. The
payment has to be `created` — this one call authorises the card, asks the seller, and then settles:

```ts
const payment = await this.payments.confirmAndSettle(payment.id, async () => {
  // the selling feature's own confirmation — confirm the booking, issue the tickets
  await this.bookings.confirm(booking.id)
  return true // false = the seller could not confirm, so the authorisation is voided
})
```

- the card is declined → **failed**, and the seats stay held
- the seller confirmed → **capture** (the customer is charged) and a receipt is issued
- the seller declined → **void** (the authorisation is released, the customer is not charged)

A zero-cash payment (an award booking paid with miles only) has no card, so there is nothing to authorise and nothing
to void: the seller's confirmation is all there is, and the payment goes straight to `captured`.

### The rest of the service

- `getPaymentStatus(userId, paymentId)` — the seller polls it for its own confirmation page. It returns the stored
  status, the screen state and whether a receipt exists.
- `expireIfPastDeadline(paymentId)` — the seller, on a timer. Voids a payment whose hold ran out.
- `retryCapture(paymentId, actor, note)` — staff, on the exception list. Captures an authorisation whose capture
  stalled.
- `voidPayment(paymentId, reason, actor)` — staff, and 3b when it cancels a booking. Releases an authorisation without
  charging.

## The REST surface

Everything is under the global `/api` prefix and behind the global `JwtAuthGuard` (a bearer token is required; there is
no role check yet — see "Open questions").

- `GET /api/payments/:id` — the selling feature's confirmation page polls this and renders the state.
- `GET /api/receipts` — customer-web, the receipts list. Takes `limit`.
- `GET /api/receipts/:id` — customer-web, one receipt with its lines and any credit note.
- `GET /api/staff/payments` — staff-web, the payment lookup. Takes `status`, `source_feature` and `limit`.
- `GET /api/staff/payments/:id` — staff-web, one payment with the capture-stalled panel.
- `GET /api/staff/payment-exceptions` — staff-web, the exception tabs. Takes `tab`, one of `needs_action`, `queued`,
  `resolved` or `all`.
- `POST /api/staff/payments/:id/retry-capture` — staff-web, "Retry capture".
- `POST /api/staff/payments/:id/void` — staff-web, "Void the authorisation".

The `Payment result` page the frames show is **not** here: the frames say it is the selling feature's own confirmation
page, which polls `GET /api/payments/:id` and renders the state itself.

## Statuses

The stored status is the schema's closed set — `created`, `authorised`, `captured`, `failed`, `voided`, `expired`,
`reversed` (`apps/backend/src/db/schema.sql`). The **screen state** is one step further on, and is mapped in exactly one
file, `payment-status.ts`:

- `created` → `authorised` — "Confirming your booking": the customer paid, the seller has not confirmed yet.
- `authorised` → `authorised` — "Confirming your booking": the card is authorised, the seller has not confirmed yet.
- `authorised` with a stalled capture → `confirming` — "Confirming payment": the capture is being retried.
- `captured` → `captured` — paid. Also "paid with miles" and "cargo paid".
- `failed` → `failed` — the card was declined, and the seats are still held.
- `expired` or `voided` → `expired` — the hold ran out and the authorisation was voided, so nothing was charged.
- `reversed` → `refunded` — refunded, with a credit note.

## The fake provider

`FakePaymentGateway` decides the outcome, so a demo can walk every state without a network call:

```ts
const gateway = app.get(FakePaymentGateway)
gateway.setOutcome('approve') // 'approve' | 'decline' | 'capture_fails'
gateway.queueOutcome('decline') // the next call only, then back to the standing outcome
```

`capture_fails` makes the capture stall, which is what puts a payment on the staff exception list.

## When the real implementation lands

- **The repository** — swap `InMemoryPaymentRepository` for a Prisma-backed one that reads the `payment`,
  `payment_line`, `payment_attempt`, `receipt` and `payment_event_receipt` tables. The row shapes in `payment.types.ts`
  already mirror those columns.
- **The provider** — add a `StripePaymentGateway` implementing `authorise` and `capture`. Stripe builds, hosts and
  serves the checkout page, so 5a only creates the session and reads the result back through the webhook. Only this
  adapter converts money to cents; the database keeps `NUMERIC(12, 2)`.
- **The money** — the mock uses a JS number rounded to two decimals. The real implementation uses Prisma `Decimal`.

## Open questions

For the Database Team:

- there is no `payment_exception` table — the mock keeps the exception state, who resolved it and the note in memory
- miles live on Feature 11's redeem rows, so a payment only records the miles it redeemed, not their cash value
- `payment_setting.capture_retry_limit` (5) and `min_hold_minutes` (3) are not read yet — the mock hard-codes them
- is `source_feature = 6` excess baggage? The frames also show check-in.

For the Dev Leads:

- who owns the `Payment result` page? The frames say the selling feature does.
- the frames say a 15-minute seat hold; `payment_setting.min_hold_minutes` is 3. Which one is the deadline?
- is the feature number `05` or `5`? The screens are registered as `f5.payment_lookup` and `f5.payment_exceptions`.
- `apps/staff-web/src/features/admin-console/contracts/README.md` says feature numbers are zero-padded, but the schema,
  the admin console and this module all use the unpadded number.
- the staff routes have no role check: the access token carries no user type, so the backend cannot tell staff from
  customer. The admin console's role access matrix hides the screens in the UI, but the route itself is open to any
  signed-in user until the Dev Leads decide how it is protected.
