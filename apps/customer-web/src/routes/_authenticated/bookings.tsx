import { createFileRoute } from '@tanstack/react-router'
import { MyTripsPage } from '../../features/booking-pnr/pages/MyTripsPage'

export const Route = createFileRoute('/_authenticated/bookings')({
  component: MyTripsPage,
})
