import { createFileRoute } from '@tanstack/react-router'
import { PaymentLookupPage } from '@staff-web/features/payments-checkout/pages/PaymentLookupPage'

/** `/payments/lookup` — the staff payment list with the frames' filters. */
export const Route = createFileRoute('/_authenticated/payments/lookup/')({
  component: PaymentLookupPage,
})
