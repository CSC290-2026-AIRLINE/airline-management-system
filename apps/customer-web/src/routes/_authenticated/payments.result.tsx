import { createFileRoute } from '@tanstack/react-router'
import { PaymentResultPage } from '@customer-web/features/payments-checkout/pages/PaymentResultPage'
import { isPaymentResultState, type PaymentResultState } from '@customer-web/features/payments-checkout/payment-result'

interface PaymentResultSearch {
  /** Which payment state the page shows — one of the frames' own states. */
  state?: PaymentResultState
}

/**
 * `/payments/result` — where Stripe sends the customer back to after the checkout.
 *
 * The state rides in the query string, so every frame has an address of its own
 * (`/payments/result?state=capture_stalled`) and a state can be linked to.
 */
export const Route = createFileRoute('/_authenticated/payments/result')({
  validateSearch: (search: Record<string, unknown>): PaymentResultSearch => {
    const state = search.state
    if (typeof state === 'string' && isPaymentResultState(state)) {
      return { state }
    }
    return {}
  },
  component: PaymentResultRoute,
})

function PaymentResultRoute() {
  const { state } = Route.useSearch()
  return <PaymentResultPage initialState={state} />
}
