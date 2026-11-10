import { createFileRoute } from '@tanstack/react-router'
import { BookingDetailPage } from '../../features/booking-pnr/booking-detail/BookingDetailPage'
import { BookingSeatChangesPanel } from '../../features/booking-pnr/seats/BookingSeatChangesPanel'
import { useState } from 'react'

// The Booking Detail page (B12): the destination of "View trip" on My Trips.
export const Route = createFileRoute('/_authenticated/bookings/$reference')({
  component: BookingDetailRoute,
})

function BookingDetailRoute() {
  const { reference } = Route.useParams()
  const [revision, setRevision] = useState(0)
  return (
    <>
      <BookingDetailPage key={`${reference}-${revision}`} reference={reference} />
      <BookingSeatChangesPanel reference={reference} onChanged={() => setRevision((value) => value + 1)} />
    </>
  )
}
