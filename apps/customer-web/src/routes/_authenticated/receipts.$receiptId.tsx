import { createFileRoute } from '@tanstack/react-router'
import { ReceiptDetailPage } from '@customer-web/features/payments-checkout/pages/ReceiptDetailPage'

/** `/receipts/$receiptId` — one receipt in full. */
export const Route = createFileRoute('/_authenticated/receipts/$receiptId')({
  component: ReceiptDetailRoute,
})

function ReceiptDetailRoute() {
  const { receiptId } = Route.useParams()
  return <ReceiptDetailPage receiptId={receiptId} />
}
