import { createFileRoute } from '@tanstack/react-router'
import { BookingDetailPage } from '@staff-web/features/cargo/BookingDetailPage'

export const Route = createFileRoute('/_authenticated/cargo/bookings/$id')({
  component: BookingDetailPage,
})
