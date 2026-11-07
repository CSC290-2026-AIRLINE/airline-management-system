import { createFileRoute } from '@tanstack/react-router'
import { FlightSearchPage } from '../features/booking-search/pages/FlightSearchPage'

// Public: anyone can search (POST /search/flights is @Public() on the backend). Booking needs a signed-in customer.
export const Route = createFileRoute('/search')({
  component: FlightSearchPage,
})
