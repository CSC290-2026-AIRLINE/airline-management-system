import { createFileRoute } from '@tanstack/react-router'
import { FlightSearchPage } from '../../features/booking-search/pages/FlightSearchPage'

export const Route = createFileRoute('/_authenticated/search')({
  component: FlightSearchPage,
})
