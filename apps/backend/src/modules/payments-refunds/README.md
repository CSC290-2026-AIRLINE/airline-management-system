# payments-refunds (Feature 5b)

Refunds, vouchers and compensation, on the real tables: `refund`, `refund_line`, `compensation_voucher` and the `payment` rows
they hang off. Nothing here touches `schema.prisma`, a migration or the shared seed. `PrismaRefundRepository` is the storage;
`InMemoryRefundRepository` is a drop-in the unit tests use.

## Routes

| Route                                  | Who      | Screen code                |
| -------------------------------------- | -------- | -------------------------- |
| `GET /api/refunds`                     | customer | —                          |
| `GET /api/refunds/:id`                 | customer | —                          |
| `GET /api/refunds/refundable`          | customer | —                          |
| `POST /api/refunds`                    | customer | —                          |
| `GET /api/vouchers`                    | customer | —                          |
| `GET /api/staff/refunds`               | staff    | `f5.refund_queue`          |
| `GET /api/staff/refunds/:id`           | staff    | `f5.refund_queue`          |
| `POST /api/staff/refunds/:id/decision` | staff    | `f5.refund_queue`          |
| `GET /api/staff/compensation`          | staff    | `f5.compensation_vouchers` |
| `POST /api/staff/compensation`         | staff    | `f5.compensation_vouchers` |
| `POST /api/staff/vouchers/:id/void`    | staff    | `f5.compensation_vouchers` |

`:id` takes the row's id or the reference staff read out loud (`REF-0121`, `VCH-7K2M-91QD`).

## Status words

`refund-status.ts` is the only place that maps the schema's statuses to the frames' words.

| `refund.status`                 | Staff queue    | Customer            |
| ------------------------------- | -------------- | ------------------- |
| `requested`, `pending_approval` | Needs review   | Awaiting review     |
| `approved`, `processing`        | Paying to card | Paying to card      |
| `succeeded` (method `original`) | Refunded       | Refunded to card    |
| `succeeded` (method `voucher`)  | Voucher issued | Reissued as voucher |
| `rejected`                      | Rejected       | Rejected            |
| `failed`                        | Payout failed  | Being looked into   |

A voucher is `Active`, `Expiring` (active and ending within 14 days), `Redeemed`, `Expired` or `Voided` (`cancelled`).

## Where the frames and the schema disagree

Raise these with the reviewer or the Database Team before the real repository is written:

- **Rebook difference of 0.00.** Frame 02 lists REF-0123 at 0.00, but `refund.amount > 0` is a CHECK. The real tables cannot hold it, so no zero-amount refund is made.
- **The customer's own words.** The request dialog has a free-text reason. `refund.reason` is a closed enum and
  `decision_note` is the staff's, so there is no column for it.
- **Voucher code.** The frames show `VCH-7K2M-91QD` (eight characters); the schema's CHECK wants ten characters from
  `[A-HJ-NP-Z2-9]`. The real tables store ten, shown as `VCH-XXXXX-XXXXX`.
- **Staff-issued compensation.** A voucher must name a refund or a Feature 13 decision. "Issue compensation" is neither,
  so the mock writes a `staff_adjustment` refund behind it.
- **Fare rule check** comes from Feature 4's `quote-fee`, and the **compensation** request from Feature 13's
  `case_compensation`. Both are fields on the mock row today.

## Paying a refund to the card

Approving a refund to the card (or issuing a card compensation) goes through Feature 5a's provider (`CardRefundPort`, which
`PaymentsCheckoutService` provides):

1. The decision is saved as `processing` first, so a refund is never lost between the decision and the provider.
2. 5a asks the provider to refund. **`succeeded`**: 5a issues the credit note (`receipt` row, `document_type` `credit_note`,
   `refund_id` set), and the refund becomes `succeeded` with its `completed_at`. If every refund on the payment now adds up
   to what the payment took, the payment becomes `reversed`. **`pending`**: the refund stays `processing` with the
   provider's id, and Stripe's webhook finishes it (`settleFromProvider`, safe to repeat). **`failed`**: the refund becomes
   `failed` with the provider's reason, the lines get their amount back, and it stays in the queue for a person.
3. A goodwill voucher (`staff_adjustment`, method `voucher`) is store credit, not money out of the payment, so it does not
   count towards "refunded in full".
4. The provider's word on the money is the truth: a refund marked `failed` that Stripe later reports as `succeeded` is
   completed (and its lines are counted again).

Without the port (a unit test) a card approval stays `processing` with a placeholder `RF-` id, as it did before a provider
was connected. The smoke scripts use the fake provider (`demo/fake-provider-env.ts`), which refunds on the spot, so they
need no Stripe account and do not depend on `.env`.

## What the real tables need

- A refund is asked for on a **captured payment** of the customer's. The "booking" in a request is the payment's
  `purchase_ref`. A refund names a `payment_line` when the payment has lines (it also writes a `refund_line` and raises the
  line's `refunded_amount`), and the whole payment when it has none.
- A request cannot ask for more than what is left on the line, and only one request per line waits at a time. A rejected or
  failed refund gives its amount back to the line.
- A voucher and the refund that returns it are saved in **one transaction**. The voucher's code is the ten characters the
  schema stores; the page shows them as `VCH-XXXXX-XXXXX`.
- Voucher life comes from `payment_setting.voucher_valid_months`.
- A reference is `REF-` and the first eight characters of the refund's id, because the table has no number column.

## Try it against the database

```bash
cd apps/backend && npm run build
# the whole flow, checked row by row, then cleaned up
node -r tsconfig-paths/register dist/src/modules/payments-refunds/demo/smoke.js
# demo data for one customer (their email), made through the same service
node -r tsconfig-paths/register dist/src/modules/payments-refunds/demo/seed-demo.js you@example.com
```

## Not done yet

- The fare rule check (Feature 4's `quote-fee`) is not connected, so every request reads "Inside rules" and staff decide.
- A refund whose payout failed is not sent to the card again from the staff screen (a lost first answer could pay the
  customer twice); staff return it as a voucher or reject it. A new refund with `source_key` `reissue:<refund id>`, the
  schema's own answer, is not built.
- `ScreenAccessGuard` and `@RequireScreen` are 5a's, from `payments-checkout/guards`; both modules share them.
