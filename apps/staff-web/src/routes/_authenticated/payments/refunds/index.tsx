import { createFileRoute } from '@tanstack/react-router'
import { RefundQueuePage } from '@staff-web/features/payments-refunds/pages/RefundQueuePage'
import { isRefundQueueTab, type RefundQueueTab } from '@staff-web/features/payments-refunds/types'

/** `/payments/refunds` — the refund queue. The tab rides in the query string, so each one has an address. */
export const Route = createFileRoute('/_authenticated/payments/refunds/')({
  validateSearch: (search: Record<string, unknown>): { tab?: RefundQueueTab } => (isRefundQueueTab(search.tab) ? { tab: search.tab } : {}),
  component: RefundQueueRoute,
})

function RefundQueueRoute() {
  const { tab = 'all' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <RefundQueuePage tab={tab} onTabChange={(next) => void navigate({ search: { tab: next } })} />
}
