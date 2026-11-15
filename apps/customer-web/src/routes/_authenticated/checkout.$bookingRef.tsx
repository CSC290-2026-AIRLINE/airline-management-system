import { createFileRoute } from '@tanstack/react-router'
import { CheckoutPage } from '@customer-web/features/payments/pages/CheckoutPage'

export const Route = createFileRoute('/_authenticated/checkout/$bookingRef')({
  component: CheckoutRoute,
})

function CheckoutRoute() {
  const { bookingRef } = Route.useParams()
  return <CheckoutPage bookingReference={bookingRef} />
}
