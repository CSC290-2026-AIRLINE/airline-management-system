import { createFileRoute } from '@tanstack/react-router'
import { RefundDetailPage } from '@staff-web/features/payments/pages/RefundDetailPage'

export const Route = createFileRoute('/_authenticated/payments/refunds/$refundId')({
  component: RefundDetailRoute,
})

function RefundDetailRoute() {
  const { refundId } = Route.useParams()
  return <RefundDetailPage key={refundId} refundId={refundId} />
}
