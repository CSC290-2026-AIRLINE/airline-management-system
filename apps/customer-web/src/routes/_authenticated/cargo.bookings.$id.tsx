import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/cargo/bookings/$id')({
  component: () => <Outlet />,
})
