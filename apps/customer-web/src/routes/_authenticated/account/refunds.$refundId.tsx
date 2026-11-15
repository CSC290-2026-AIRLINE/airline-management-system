import { createFileRoute } from '@tanstack/react-router'
import { RefundDetailPage } from '@customer-web/features/payments/pages/RefundsPages'

export const Route = createFileRoute('/_authenticated/account/refunds/$refundId')({
  component: RefundDetailRoute,
})

function RefundDetailRoute() {
  const { refundId } = Route.useParams()
  return <RefundDetailPage refundId={refundId} />
}
