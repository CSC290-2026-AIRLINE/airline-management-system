import { createFileRoute } from '@tanstack/react-router'
import { MyRefundsPage } from '@customer-web/features/payments-refunds/pages/MyRefundsPage'
import { isMyRefundTab, type MyRefundTab } from '@customer-web/features/payments-refunds/types'

/** `/refunds` — the customer's refunds. The tab rides in the query string, so each one has an address. */
export const Route = createFileRoute('/_authenticated/refunds')({
  validateSearch: (search: Record<string, unknown>): { tab?: MyRefundTab } => (isMyRefundTab(search.tab) ? { tab: search.tab } : {}),
  component: MyRefundsRoute,
})

function MyRefundsRoute() {
  const { tab = 'all' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <MyRefundsPage tab={tab} onTabChange={(next) => void navigate({ search: { tab: next } })} />
}
