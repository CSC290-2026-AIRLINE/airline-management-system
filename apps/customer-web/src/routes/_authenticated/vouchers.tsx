import { createFileRoute } from '@tanstack/react-router'
import { MyVouchersPage } from '@customer-web/features/payments-refunds/pages/MyVouchersPage'

/** `/vouchers` — the customer's vouchers. */
export const Route = createFileRoute('/_authenticated/vouchers')({
  component: MyVouchersPage,
})
