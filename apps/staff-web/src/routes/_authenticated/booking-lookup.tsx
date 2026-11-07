import { createFileRoute } from '@tanstack/react-router'
import { BookingLookupPage } from '../../features/booking-pnr/pages/BookingLookupPage'

export const Route = createFileRoute('/_authenticated/booking-lookup')({
  component: BookingLookupPage,
})
