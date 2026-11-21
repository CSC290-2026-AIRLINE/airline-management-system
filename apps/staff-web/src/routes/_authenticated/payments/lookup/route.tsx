import { createFileRoute, Outlet } from '@tanstack/react-router'

/**
 * Layout for the payment lookup.
 *
 * The lookup and one payment in full are two screens under the same path, so the path needs a layout of its own: the
 * list is the index route and a payment is the `$paymentId` child.
 */
export const Route = createFileRoute('/_authenticated/payments/lookup')({
  component: PaymentLookupLayout,
})

function PaymentLookupLayout() {
  return <Outlet />
}
