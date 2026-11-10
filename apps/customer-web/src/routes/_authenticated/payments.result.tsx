import { createFileRoute } from '@tanstack/react-router'
import { PaymentResultPage } from '@customer-web/features/payments-checkout/pages/PaymentResultPage'

/** `/payments/result` — where Stripe sends the customer back to after the checkout. */
export const Route = createFileRoute('/_authenticated/payments/result')({
  component: PaymentResultPage,
})
