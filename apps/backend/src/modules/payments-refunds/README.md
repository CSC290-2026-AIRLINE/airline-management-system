# payments-refunds (Feature 5b)

Refunds, vouchers and compensation. Mock-first: the rows live in memory behind `RefundRepository`, so nothing here touches
`schema.prisma`, a migration or `apps/backend/src/db`. Every mock spot carries a `TODO(F5b)`.

## Routes

| Route                                  | Who      | Screen code                |
| -------------------------------------- | -------- | -------------------------- |
| `GET /api/refunds`                     | customer | —                          |
| `GET /api/refunds/:id`                 | customer | —                          |
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

- **Rebook difference of 0.00.** Frame 02 lists REF-0123 at 0.00, but `refund.amount > 0` is a CHECK. The mock keeps the frame.
- **The customer's own words.** The request dialog has a free-text reason. `refund.reason` is a closed enum and
  `decision_note` is the staff's, so there is no column for it.
- **Voucher code.** The frames show `VCH-7K2M-91QD` (eight characters); the schema's CHECK wants ten characters from
  `[A-HJ-NP-Z2-9]`. The mock stores the shorter form.
- **Staff-issued compensation.** A voucher must name a refund or a Feature 13 decision. "Issue compensation" is neither,
  so the mock writes a `staff_adjustment` refund behind it.
- **Fare rule check** comes from Feature 4's `quote-fee`, and the **compensation** request from Feature 13's
  `case_compensation`. Both are fields on the mock row today.

## Not done on this branch

- The "Request a refund" button on a receipt belongs to Feature 5a's receipt screens. 5b ships the dialog's API
  (`POST /api/refunds`); the button is wired after both branches are merged.
- `ScreenAccessGuard` and `@RequireScreen` are copies of 5a's. Merge them into one place after the branches meet.
- `AppModule` registers `PaymentsRefundsModule`. 5a registers its own module in the same list, so the merge is a one-line
  conflict.
