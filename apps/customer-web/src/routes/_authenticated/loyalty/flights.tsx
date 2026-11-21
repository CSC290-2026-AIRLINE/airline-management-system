import { createFileRoute } from '@tanstack/react-router'
import { parseAwardSearch } from '../../../features/loyalty/award-search'
import { FlightSearchPage } from '../../../features/loyalty/components/FlightSearchPage'
import { LoyaltyError } from '../../../features/loyalty/components/LoyaltyPages'

export const Route = createFileRoute('/_authenticated/loyalty/flights')({
  validateSearch: parseAwardSearch,
  component: FlightSearchRoute,
  errorComponent: LoyaltyError,
})

function FlightSearchRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return <FlightSearchPage search={search} onSearch={(next) => void navigate({ search: next })} />
}
