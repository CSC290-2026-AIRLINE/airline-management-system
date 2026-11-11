import { createFileRoute } from '@tanstack/react-router'
import { RefundDetailPage } from '@staff-web/features/payments-refunds/pages/RefundDetailPage'

/** `/payments/refunds/$refundId` — one refund in full, with the decision panel. */
export const Route = createFileRoute('/_authenticated/payments/refunds/$refundId')({
  component: RefundDetailRoute,
})

function RefundDetailRoute() {
  const { refundId } = Route.useParams()
  return <RefundDetailPage refundId={refundId} />
}
