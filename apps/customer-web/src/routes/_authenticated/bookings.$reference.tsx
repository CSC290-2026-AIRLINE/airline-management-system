import { createFileRoute } from '@tanstack/react-router'
import { BookingLayout } from '../../features/booking-search/components/BookingLayout'
import { BookingDetailPage } from '../../features/booking-pnr/booking-detail/BookingDetailPage'

// The Booking Detail page (B12): the destination of "View trip" on My Trips.
export const Route = createFileRoute('/_authenticated/bookings/$reference')({
  component: BookingDetailRoute,
})

function BookingDetailRoute() {
  const { reference } = Route.useParams()
  return (
    <BookingLayout>
      <BookingDetailPage reference={reference} />
    </BookingLayout>
  )
}
