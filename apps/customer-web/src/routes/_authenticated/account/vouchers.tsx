import { createFileRoute } from '@tanstack/react-router'
import { VouchersPage } from '@customer-web/features/payments/pages/VouchersPage'

export const Route = createFileRoute('/_authenticated/account/vouchers')({
  component: VouchersPage,
})
