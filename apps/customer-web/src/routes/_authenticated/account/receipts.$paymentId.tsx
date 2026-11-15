import { createFileRoute } from '@tanstack/react-router'
import { ReceiptDetailPage } from '@customer-web/features/payments/pages/ReceiptsPages'

export const Route = createFileRoute('/_authenticated/account/receipts/$paymentId')({
  component: ReceiptDetailRoute,
})

function ReceiptDetailRoute() {
  const { paymentId } = Route.useParams()
  return <ReceiptDetailPage paymentId={paymentId} />
}
