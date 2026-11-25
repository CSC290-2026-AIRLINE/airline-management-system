import { createFileRoute } from '@tanstack/react-router'
import { CompensationPage } from '@staff-web/features/payments-refunds/pages/CompensationPage'
import { isCompensationFilter, type CompensationFilter } from '@staff-web/features/payments-refunds/types'

/** `/payments/compensation` — the compensation and vouchers history. The chip rides in the query string. */
export const Route = createFileRoute('/_authenticated/payments/compensation')({
  validateSearch: (search: Record<string, unknown>): { filter?: CompensationFilter } =>
    isCompensationFilter(search.filter) ? { filter: search.filter } : {},
  component: CompensationRoute,
})

function CompensationRoute() {
  const { filter = 'all' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <CompensationPage filter={filter} onFilterChange={(next) => void navigate({ search: { filter: next } })} />
}
