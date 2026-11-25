import { createFileRoute } from '@tanstack/react-router'
import { ReceiptsPage } from '@customer-web/features/payments-checkout/pages/ReceiptsPage'

/** `/receipts` — the customer's receipts, newest first. */
export const Route = createFileRoute('/_authenticated/receipts/')({
  component: ReceiptsPage,
})
