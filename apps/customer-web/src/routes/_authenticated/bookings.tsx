import { createFileRoute, Outlet } from '@tanstack/react-router'

// The layout of the bookings section: My Trips at /bookings and the booking detail at /bookings/$reference.
export const Route = createFileRoute('/_authenticated/bookings')({
  component: BookingsLayout,
})

function BookingsLayout() {
  return <Outlet />
}
