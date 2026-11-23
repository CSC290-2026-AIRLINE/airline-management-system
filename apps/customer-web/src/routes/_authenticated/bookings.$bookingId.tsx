import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { BookingDetailsPage } from '../../features/onboard-products/BookingDetailsPage'

export const Route = createFileRoute('/_authenticated/bookings/$bookingId')({
  component: BookingsBookingIdRoute,
})

const ONE_SHOT_NOTICE_KEY = 'f12:order-confirmed'

function BookingsBookingIdRoute() {
  const { bookingId } = Route.useParams()
  const [oneShotNotice] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.sessionStorage.getItem(ONE_SHOT_NOTICE_KEY)
    } catch {
      return null
    }
  })
  useEffect(() => {
    if (oneShotNotice === null) return
    try {
      window.sessionStorage.removeItem(ONE_SHOT_NOTICE_KEY)
    } catch {
      // best-effort; a leftover entry is harmless because the next
      // booking-page mount will re-read it (and clear it again).
    }
  }, [oneShotNotice])
  return <BookingDetailsPage bookingId={bookingId} noticeOrderId={oneShotNotice} />
}
