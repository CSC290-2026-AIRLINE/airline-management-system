import { createFileRoute } from '@tanstack/react-router'
import { PaymentDetailPage } from '@staff-web/features/payments-checkout/pages/PaymentDetailPage'

/** `/payments/lookup/$paymentId` — one payment in full, including the capture-stalled panel. */
export const Route = createFileRoute('/_authenticated/payments/lookup/$paymentId')({
  component: PaymentDetailRoute,
})

function PaymentDetailRoute() {
  const { paymentId } = Route.useParams()
  return <PaymentDetailPage paymentId={paymentId} />
}
