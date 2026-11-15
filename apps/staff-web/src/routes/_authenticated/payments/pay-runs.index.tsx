import { createFileRoute } from '@tanstack/react-router'
import { PayRunsPage } from '@staff-web/features/payments/crew-pay/PayRunsPage'

export const Route = createFileRoute('/_authenticated/payments/pay-runs/')({
  component: PayRunsPage,
})
