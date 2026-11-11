import { BookingLayout } from '../features/booking-search/components/BookingLayout'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { FlightSearchPage } from '../features/booking-search/pages/FlightSearchPage'
import { saveItinerary } from '../features/booking-pnr/flow/draft'
import {
  flightSearchParamsFromState,
  flightSearchStateFromParams,
  parseFlightSearchParams,
  type FlightSearchParams,
} from '../features/booking-search/search-params'

/**
 * The search lives in the URL, so a refresh, a Back button or a shared link brings back the same search: the form,
 * the results, the sort order and the picked fares. The results themselves are fetched again from the API.
 */
export const Route = createFileRoute('/search')({
  validateSearch: (search: Record<string, unknown>): FlightSearchParams => parseFlightSearchParams(search),
  component: SearchRoute,
})
function SearchRoute() {
  const navigate = useNavigate()
  const urlState = flightSearchStateFromParams(Route.useSearch())
  return (
    <BookingLayout>
      <FlightSearchPage
        urlState={urlState}
        onUrlChange={(next) => {
          void navigate({
            to: '/search',
            search: flightSearchParamsFromState(next),
            replace: true,
          })
        }}
        onContinue={(itinerary) => {
          saveItinerary(itinerary)
          void navigate({ to: '/booking' })
        }}
      />
    </BookingLayout>
  )
}
