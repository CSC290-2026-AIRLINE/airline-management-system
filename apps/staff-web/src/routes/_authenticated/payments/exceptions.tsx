import { createFileRoute } from '@tanstack/react-router'
import { PaymentExceptionsPage } from '@staff-web/features/payments-checkout/pages/PaymentExceptionsPage'

/** `/payments/exceptions` — the payments that need a person, by tab. */
export const Route = createFileRoute('/_authenticated/payments/exceptions')({
  component: PaymentExceptionsPage,
})
