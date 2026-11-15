import { createFileRoute } from '@tanstack/react-router'
import { PaymentResultPage } from '@customer-web/features/payments-checkout/pages/PaymentResultPage'
import {
  isPaymentOutcome,
  isPaymentResultState,
  type PaymentOutcome,
  type PaymentResultState,
} from '@customer-web/features/payments-checkout/payment-result'

interface PaymentResultSearch {
  /** Which prototype state the page shows — one of the frames' own states. */
  state?: PaymentResultState
  /** The payment Stripe sent the customer back for. */
  payment?: string
  /** How the customer left Stripe's page. */
  outcome?: PaymentOutcome
}

/**
 * `/payments/result` — where Stripe sends the customer back to after the checkout.
 *
 * Stripe's return addresses are `/payments/result?payment=<id>&outcome=paid` and `…&outcome=cancelled`; the backend
 * builds them (`payments.controller.ts`). With a payment the page shows that payment. Without one it is the prototype,
 * where the state rides in the query string (`/payments/result?state=capture_stalled`) so a state can be linked to.
 */
export const Route = createFileRoute('/_authenticated/payments/result')({
  validateSearch: (search: Record<string, unknown>): PaymentResultSearch => {
    const result: PaymentResultSearch = {}
    if (typeof search.state === 'string' && isPaymentResultState(search.state)) result.state = search.state
    if (typeof search.payment === 'string' && search.payment.length > 0 && search.payment.length <= 64) result.payment = search.payment
    if (typeof search.outcome === 'string' && isPaymentOutcome(search.outcome)) result.outcome = search.outcome
    return result
  },
  component: PaymentResultRoute,
})

function PaymentResultRoute() {
  const { state, payment, outcome } = Route.useSearch()
  return <PaymentResultPage initialState={state} paymentId={payment} outcome={outcome} />
}
