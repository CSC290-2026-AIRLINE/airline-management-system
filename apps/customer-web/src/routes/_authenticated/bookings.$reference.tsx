import { createFileRoute } from '@tanstack/react-router'
import { BookingDetailPage } from '../../features/booking-pnr/booking-detail/BookingDetailPage'

// The Booking Detail page (B12): the destination of "View trip" on My Trips.
export const Route = createFileRoute('/_authenticated/bookings/$reference')({
  component: BookingDetailRoute,
})

function BookingDetailRoute() {
  const { reference } = Route.useParams()
  return <BookingDetailPage reference={reference} />
}
