import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/cargo/bookings/$id')({
  component: () => <p>Loading…</p>,
})
