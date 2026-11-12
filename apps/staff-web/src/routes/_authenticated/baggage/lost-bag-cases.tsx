import { createFileRoute } from '@tanstack/react-router'
import { CASE_FILTERS, type CaseFilter } from '@staff-web/features/baggage/constants'
import { LostBagCasesPage } from '@staff-web/features/baggage/pages/LostBagCasesPage'

interface LostBagCasesSearch {
  case?: string
  /** Left out for the default chip, Active. */
  status?: Exclude<CaseFilter, 'active'>
  /** Left out when all departure airports are shown. */
  from?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/_authenticated/baggage/lost-bag-cases')({
  validateSearch: (search: Record<string, unknown>): LostBagCasesSearch => ({
    case: typeof search.case === 'string' && UUID.test(search.case) ? search.case : undefined,
    status: CASE_FILTERS.filter((f) => f !== 'active').find((f) => f === search.status),
    from: typeof search.from === 'string' && /^[A-Z]{3}$/i.test(search.from) ? search.from.toUpperCase() : undefined,
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
      from={search.from}
      onSelect={(id) => void navigate({ search: (prev) => ({ ...prev, case: id }) })}
      onFilterChange={(f) => void navigate({ search: (prev) => ({ ...prev, status: f === 'active' ? undefined : f }) })}
      onFromChange={(from) => void navigate({ search: (prev) => ({ ...prev, from }) })}
    />
  )
}
