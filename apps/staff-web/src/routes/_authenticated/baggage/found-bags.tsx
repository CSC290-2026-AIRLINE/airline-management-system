import { createFileRoute } from '@tanstack/react-router'
import { FOUND_BAG_STATUSES, type FoundBagStatus } from '@staff-web/features/baggage/constants'
import { FoundBagsPage } from '@staff-web/features/baggage/pages/FoundBagsPage'

interface FoundBagsSearch {
  bag?: string
  status?: FoundBagStatus
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/_authenticated/baggage/found-bags')({
  validateSearch: (search: Record<string, unknown>): FoundBagsSearch => ({
    bag: typeof search.bag === 'string' && UUID.test(search.bag) ? search.bag : undefined,
    status: FOUND_BAG_STATUSES.find((s) => s === search.status),
  }),
  component: FoundBagsRoute,
})

function FoundBagsRoute() {
  const { bag, status } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <FoundBagsPage
      selectedId={bag}
      status={status}
      onSelect={(id) => void navigate({ search: (prev) => ({ ...prev, bag: id }) })}
      onStatusChange={(s) => void navigate({ search: (prev) => ({ ...prev, status: s }) })}
    />
  )
}
