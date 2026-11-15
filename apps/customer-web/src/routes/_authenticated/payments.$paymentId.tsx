import { createFileRoute } from '@tanstack/react-router'
import { PaymentReturnPage } from '@customer-web/features/payments/pages/PaymentReturnPage'

// The hosted page's success URL. The page polls the payment; the redirect itself proves nothing.
export const Route = createFileRoute('/_authenticated/payments/$paymentId')({
  validateSearch: (search: Record<string, unknown>): { declined?: boolean } => (search.declined ? { declined: true } : {}),
  component: PaymentReturnRoute,
})

function PaymentReturnRoute() {
  const { paymentId } = Route.useParams()
  const { declined } = Route.useSearch()
  return <PaymentReturnPage paymentId={paymentId} declined={declined} />
}
