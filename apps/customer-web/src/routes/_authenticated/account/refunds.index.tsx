import { createFileRoute } from '@tanstack/react-router'
import { RefundsPage } from '@customer-web/features/payments/pages/RefundsPages'

// ?request=<payment id> opens the request form for that payment.
export const Route = createFileRoute('/_authenticated/account/refunds/')({
  validateSearch: (search: Record<string, unknown>): { request?: string } =>
    typeof search.request === 'string' ? { request: search.request } : {},
  component: RefundsRoute,
})

function RefundsRoute() {
  const { request } = Route.useSearch()
  return <RefundsPage requestFor={request} />
}
