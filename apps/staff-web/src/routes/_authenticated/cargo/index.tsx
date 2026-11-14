import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/cargo/')({
  beforeLoad: () => {
    throw redirect({ to: '/cargo/bookings', search: { status: 'all' } })
  },
})
