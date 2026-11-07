import { createFileRoute } from '@tanstack/react-router'
import { DELIVERY_FILTERS, type DeliveryFilter } from '@staff-web/features/baggage/constants'
import { DeliveriesPage } from '@staff-web/features/baggage/pages/DeliveriesPage'

interface DeliveriesSearch {
  /** The lost bag case whose delivery is open. */
  case?: string
  /** Left out for the default chip, Active. */
  status?: Exclude<DeliveryFilter, 'active'>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/_authenticated/baggage/deliveries')({
  validateSearch: (search: Record<string, unknown>): DeliveriesSearch => ({
    case: typeof search.case === 'string' && UUID.test(search.case) ? search.case : undefined,
    status: DELIVERY_FILTERS.filter((f) => f !== 'active').find((f) => f === search.status),
  }),
  component: DeliveriesRoute,
})

function DeliveriesRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <DeliveriesPage
      selectedCaseId={search.case}
      filter={search.status ?? 'active'}
      onSelect={(id) => void navigate({ search: (prev) => ({ ...prev, case: id }) })}
      onFilterChange={(f) => void navigate({ search: (prev) => ({ ...prev, status: f === 'active' ? undefined : f }) })}
    />
  )
}
