import { createFileRoute } from '@tanstack/react-router'
import { ReceiptsPage } from '@customer-web/features/payments/pages/ReceiptsPages'

export const Route = createFileRoute('/_authenticated/account/receipts/')({
  component: ReceiptsPage,
})
