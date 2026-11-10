# Feature 5a — checkout and payment state

The payment module the selling features (3 booking, 6 excess baggage, 12 onboard sale, 17 cargo) call when a customer
buys something, and the REST surface the two frontends read.

**This is the mock.** The database is not ready, so nothing here talks to Prisma: the rows live in a `Map` behind
`PAYMENT_REPOSITORY`, and the provider is a fake one behind `PAYMENT_GATEWAY`. Both seams are one line in
`payments-checkout.module.ts`; when the real implementations land, nothing else in the module changes.

The repository's methods are asynchronous, because Prisma's are: the mock resolves immediately, so the service awaits it
exactly as it will await the database later.

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
  status, the screen state, the deadline and whether a receipt exists.
- `expireIfPastDeadline(paymentId)` — the seller, on a timer. Voids a payment whose hold ran out.
- `retryCapture(paymentId, actor, note)` — staff, on the exception list. Captures an authorisation whose capture
  stalled.
- `voidPayment(paymentId, reason, actor)` — **3b only**, when it cancels a booking. Releases an authorisation without
  charging. The frames have no staff void button, so there is no route for it.
- `sendFinancePosting(paymentId, actor)` — staff, on the exception list. Sends a payment the finance ledger did not
  accept.

## The REST surface

Everything is under the global `/api` prefix and behind the global `JwtAuthGuard` (a bearer token is required). The
staff routes add one more gate — the admin console's screen grant (see "Who can open the staff screens").

- `GET /api/payments/:id` — the selling feature's confirmation page polls this and renders the state.
- `GET /api/receipts` — customer-web, the receipts list. Takes `search`, `filter` and `limit`, and returns the counts
  the filter chips show.
- `GET /api/receipts/:id` — customer-web, one receipt with its lines and any credit note.
- `GET /api/staff/payments` — staff-web, the payment lookup. Takes `status`, `source_feature`, `search`, `page` and
  `limit`, and returns the counts the filter chips show. **Read only.**
- `GET /api/staff/payments/:id` — staff-web, one payment with its state history.
- `GET /api/staff/payment-exceptions` — staff-web, the exception tabs. Takes `tab`, one of `needs_action`, `queued`,
  `resolved` or `all`. Returns a list of **problems**, not of payments: each row says what happened, what to do about
  it and when it started.
- `POST /api/staff/payment-exceptions/:id/retry-capture` — staff-web, "Retry capture".
- `POST /api/staff/payment-exceptions/:id/send-posting` — staff-web, "Send now".

The `Payment result` page the frames show is **not** here: the frames say it is the selling feature's own confirmation
page, which polls `GET /api/payments/:id` and renders the state itself.

## Who can open the staff screens

The access token carries no user type — the backend cannot tell a staff member from a customer by reading it. So the
staff routes do not ask the token; they ask the **admin console**, which owns the Role access matrix.

The chain, in the order it happens:

1. **Register.** On boot, the module calls `AdminConsoleService.registerSelfScreens` with the two screens:
   `f5.payment_lookup` and `f5.payment_exceptions`, both `kind: 'assignable'` and `feature_no: '5'`.
2. **Grant.** An Admin opens the Role access tab (`/admin/roles`), ticks the two screens for a role, and saves.
   `PUT /api/admin/roles/:id/screens` writes the `role_screen` rows and the `screen_access_change` audit row.
3. **Ask.** `GET /api/me/screens` answers with the codes the signed-in caller may open. staff-web calls it through
   `useScreenAccess()`, and the pages hide themselves with `NoAccessScreen` when the code is missing.
4. **Refuse.** `ScreenAccessGuard` asks the same question on the server, through the same `getMyScreens`, so the API
   answers the same way the page does. A caller with no staff account holds no grants, so a customer's token is refused
   here too. The refusal is written to `audit_log` as `access_denied`, and the write can never change the answer: if it
   fails, the request is still refused.
5. **Record the read.** Opening a payment is written to `audit_log` as `view_sensitive`, because a payment record
   carries a customer's name, email and the last four digits of their card.

```ts
@Controller('staff')
export class StaffPaymentsController {
  @Get('payments')
  @RequireScreen('f5.payment_lookup')
  listPayments(@Query() query: StaffPaymentQueryDto): Promise<StaffPaymentListDto> {
    return this.svc.listStaffPayments(query)
  }
}
```

`@RequireScreen` puts the code on the route; `ScreenAccessGuard` reads it. A route with no code is a wiring mistake
and fails with a 500 rather than an open door.

The frontend's `NoAccessScreen` passes `recorded={false}`, because the page is refused before any API call — so there
is no row for *that* attempt. The rows are written by the backend guard for the requests that reach it.

## The exception list is a list of problems

The frames' "Payment exceptions" page does not list payments. It lists **what went wrong**: the headline, the
reference it belongs to, "what happened", "what to do" and "since". A payment that is simply in flight is not on the
list.

The five problems 5a can raise are in `payment.types.ts` (`PAYMENT_PROBLEM_TYPES`):

| Problem                  | State       | Action                                    |
| ------------------------ | ----------- | ----------------------------------------- |
| Ticket capture stalled   | needs action | Retry capture                             |
| Cargo capture stalled    | needs action | Retry capture                             |
| Waiting for the provider | queued      | none — the reconciliation job is checking |
| Finance posting delayed  | queued      | Send now                                  |
| Authorisation voided     | resolved    | none — the customer was not charged       |

Feature 5c's "Crew payout failed" belongs to the same page in the frames, but it is 5c's row and 5a does not raise it.

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
  `payment_line`, `payment_attempt`, `receipt` and `payment_event_receipt` tables. The interface is already async and
  the row shapes in `payment.types.ts` already mirror those columns, so the service does not change.
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

- who owns the `Payment result` page? The frames answer it: every payment-result frame is the selling feature's own
  confirmation page (3 booking, 6 excess baggage, 12 onboard, 17 cargo), so 5a only exposes the polled state.
- the frames say a 15-minute seat hold; `payment_setting.min_hold_minutes` is 3. Which one is the deadline? The frames'
  countdown (`02e`, `09:12` left) and the hold in `02f` are 15 minutes, so `min_hold_minutes` is not the seat hold.
- the frames say the staff payment lookup is **read only** ("staff cannot edit a state by hand"), and `Retry capture`
  lives on **Payment exceptions**. There is no staff void button anywhere in the frames — `Authorisation voided` is a
  resolved problem the system reaches on its own.
- is the feature number `05` or `5`? The screens are registered as `f5.payment_lookup` and `f5.payment_exceptions`.
- `apps/staff-web/src/features/admin-console/contracts/README.md` says feature numbers are zero-padded, but the schema,
  the admin console and this module all use the unpadded number.
- the two screens need a grant before anyone can use them: the Role access matrix has no default grant for them, so a
  new role has to be given `f5.payment_lookup` / `f5.payment_exceptions` by an Admin. Should 5a ask the Dev Leads to
  add them to the default staff role?
