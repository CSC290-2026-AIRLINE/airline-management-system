import { createFileRoute } from '@tanstack/react-router'
import { CompensationVouchersPage } from '@staff-web/features/payments/pages/CompensationVouchersPage'

export const Route = createFileRoute('/_authenticated/payments/compensation')({
  component: CompensationVouchersPage,
})
