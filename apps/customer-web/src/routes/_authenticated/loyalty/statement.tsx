import { createFileRoute } from '@tanstack/react-router'
import { LoyaltyError, StatementRoutePage } from '../../../features/loyalty/components/LoyaltyPages'
import { STATEMENT_TYPES, type StatementSearch } from '../../../features/loyalty/statement-search'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const day = (v: unknown) => (typeof v === 'string' && DAY.test(v) ? v : undefined)

export const Route = createFileRoute('/_authenticated/loyalty/statement')({
  validateSearch: (search: Record<string, unknown>): StatementSearch => ({
    type: STATEMENT_TYPES.find((t) => t === search.type),
    range: search.range === '12m' || search.range === 'all' ? search.range : undefined,
    from: day(search.from),
    to: day(search.to),
  }),
  component: StatementRoute,
  errorComponent: LoyaltyError,
})

function StatementRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return <StatementRoutePage search={search} onSearch={(next) => void navigate({ search: next, replace: true })} />
}
