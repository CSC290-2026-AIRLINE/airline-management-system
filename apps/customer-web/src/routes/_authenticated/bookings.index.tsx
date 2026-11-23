import { createFileRoute } from '@tanstack/react-router'
import { BookingLayout } from '../../features/booking-search/components/BookingLayout'
import { MyBookingsPage } from '../../features/booking-pnr/my-bookings/MyBookingsPage'

// My Trips (B11), the index of the bookings section. The tab is URL state, so "Upcoming" and "Past" can be linked to.
export const Route = createFileRoute('/_authenticated/bookings/')({
  validateSearch: (search: Record<string, unknown>): { tab?: 'upcoming' | 'past' } => ({
    tab: search.tab === 'past' ? 'past' : 'upcoming',
  }),
  component: BookingsRoute,
})

function BookingsRoute() {
  const { tab } = Route.useSearch()
  return (
    <BookingLayout>
      <MyBookingsPage tab={tab ?? 'upcoming'} />
    </BookingLayout>
  )
}
