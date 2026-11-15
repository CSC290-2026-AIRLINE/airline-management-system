import { createFileRoute } from '@tanstack/react-router'
import { PaymentExceptionsPage } from '@staff-web/features/payments/pages/PaymentExceptionsPage'

export const Route = createFileRoute('/_authenticated/payments/exceptions')({
  component: PaymentExceptionsPage,
})
