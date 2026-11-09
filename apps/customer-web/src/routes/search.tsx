import { BookingLayout } from '../features/booking-search/components/BookingLayout'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { FlightSearchPage } from '../features/booking-search/pages/FlightSearchPage'
import { saveItinerary } from '../features/booking-pnr/flow/draft'

export const Route = createFileRoute('/search')({ component: SearchRoute })
function SearchRoute() {
  const navigate = useNavigate()
  return (
    <BookingLayout>
      <FlightSearchPage
        onContinue={(itinerary) => {
          saveItinerary(itinerary)
          void navigate({ to: '/booking' })
        }}
      />
    </BookingLayout>
  )
}
