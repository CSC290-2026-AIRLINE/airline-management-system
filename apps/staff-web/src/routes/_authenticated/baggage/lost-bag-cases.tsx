import { createFileRoute } from '@tanstack/react-router'
import { CASE_FILTERS, type CaseFilter } from '@staff-web/features/baggage/constants'
import { LostBagCasesPage } from '@staff-web/features/baggage/pages/LostBagCasesPage'

interface LostBagCasesSearch {
  case?: string
  /** Left out for the default chip, Active. */
  status?: Exclude<CaseFilter, 'active'>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/_authenticated/baggage/lost-bag-cases')({
  validateSearch: (search: Record<string, unknown>): LostBagCasesSearch => ({
    case: typeof search.case === 'string' && UUID.test(search.case) ? search.case : undefined,
    status: CASE_FILTERS.filter((f) => f !== 'active').find((f) => f === search.status),
  }),
  component: LostBagCasesRoute,
})

function LostBagCasesRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <LostBagCasesPage
      selectedId={search.case}
      filter={search.status ?? 'active'}
      onSelect={(id) => void navigate({ search: (prev) => ({ ...prev, case: id }) })}
      onFilterChange={(f) => void navigate({ search: (prev) => ({ ...prev, status: f === 'active' ? undefined : f }) })}
    />
  )
}
