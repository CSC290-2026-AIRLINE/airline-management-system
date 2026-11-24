# Payments dev tools (Feature 5) — DELETE BEFORE THE PR MERGES

> **TODO(F5-dev):** this whole module is a development aid. It is not part of the product. Remove it with the checklist at the
> bottom before the PR to `dev` is merged.

Feature 5 cannot be tried end to end on its own: a payment is started by a selling feature (3b, 6, 12, 17) and the crew pay
needs flights that Feature 8 has not produced yet. These tools stand in for those two, so every part of Feature 5 can be
tried by hand. They are **off** unless `PAYMENT_DEV_TOOLS="true"`, answer 404 when off, and env validation refuses them when
`NODE_ENV` is `production`.

## Turn them on

In `apps/backend/.env` (never commit it):

```
PAYMENT_DEV_TOOLS="true"
PAYMENT_PROVIDER="stripe"          # for the payment sandbox; "fake" has no payment page
STRIPE_SECRET_KEY="sk_test_…"
STRIPE_WEBHOOK_SECRET="whsec_…"    # from `stripe listen`
```

Restart the backend. The log says `Payment dev tools are ON`.

## The payment sandbox (customer-web, `/dev/payments`)

A stand-in for the selling feature. Everything after the first click is the real thing.

1. `stripe listen --events payment_intent.amount_capturable_updated,payment_intent.payment_failed,checkout.session.expired,refund.updated,refund.failed --forward-to localhost:8080/api/webhooks/stripe`, and put its `whsec_…` in `.env`.
2. Sign in to customer-web (http://localhost:5151) and open `/dev/payments`. Create a test payment.
3. **Pay with Stripe**: card `4242 4242 4242 4242`, any future date, any CVC. Stripe brings you back to
   `/payments/result?payment=…&outcome=paid`, which shows the real payment (confirming, then paid).
4. Staff-web **Payment lookup** shows it as Captured. Customer-web **Receipts** has the receipt; ask for a refund there.
5. Staff-web **Refund queue**: approve it to the card. Stripe refunds it, the refund becomes Refunded with a credit note, and the payment
   moves to Refunded when nothing is left on it.

Routes: `GET`/`POST`/`DELETE /api/dev/payments` (customer). **Remove my test payments** deletes every test payment of yours with its
receipts, refunds, attempts and lines.

## The crew pay data (staff-web, `/dev/crew-pay`)

A stand-in for Feature 8, from the dev fixture in `payments-crew-pay/demo/crew-pay-fixture.ts`, as buttons, with a **Remove**.

1. **Add sample crew work**: three crew (`F5C-001..003`), one pairing of four flights that have arrived, priced at once. The cabin
   crew member is linked to your sign-in, so My Pay shows their pay.
2. **Create a draft pay run**: made by another staff member, because a run's creator may not approve it.
3. Open **Pay Runs**: approve it as yourself, then pay it. One payout fails on purpose (the first officer has no payout contact);
   Retry fails again until an email is added to her crew record.
4. Open **My Pay**.

Routes: `GET`/`DELETE /api/dev/crew-pay`, `POST /api/dev/crew-pay/seed`, `POST /api/dev/crew-pay/draft-run` (a staff member; pay
needs an admin or finance role).

**It writes into other teams' tables**: `crew` (F8), `aircraft_type`, `aircraft`, `flight` (F2), `roster_run`, `roster_run_pairing`,
`pairing`, `pairing_leg`, `pairing_leg_assignment` (F8), and our own `payroll_line`, `pay_run`, `payout`. Every row is found again by a
tag (crew `F5C-…`, aircraft `HS-FVC`, type `F5-DEMO`), and Remove takes out only those.

**What Remove cannot take back:** pricing and paying write `finance_posting` rows, and that table is append-only (a trigger refuses
deletes). Use a development database, and expect Feature 4's monthly summary there to include them.

## Checked

`demo/smoke.ts` drives all of this through the real routes and checks that every table is back to its starting row count. Run it on a
**copy** of the database (see its header), never on the one you work in.

## Remove it before the PR merges

- [ ] `apps/backend/src/modules/payments-dev-tools/` (this folder)
- [ ] the import and `PaymentsDevToolsModule` line in `apps/backend/src/app.module.ts`
- [ ] `PAYMENT_DEV_TOOLS` in `apps/backend/.env.example`, `src/config/env.validation.ts` and `env.validation.spec.ts`
- [ ] `apps/customer-web/src/features/payments-checkout/dev/` and `apps/customer-web/src/routes/_authenticated/dev.payments.tsx`
- [ ] `apps/staff-web/src/features/payments-crew-pay/dev/` and `apps/staff-web/src/routes/_authenticated/dev/crew-pay.tsx`
- [ ] `PAYMENT_DEV_TOOLS` in your own `.env`

Everything is marked `TODO(F5-dev)`: `grep -rn "F5-dev" apps` lists every place.
