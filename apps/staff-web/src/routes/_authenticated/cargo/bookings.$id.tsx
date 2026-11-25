import { createFileRoute } from '@tanstack/react-router'
import { BookingDetailPage } from '@staff-web/features/cargo/BookingDetailPage'

export const Route = createFileRoute('/_authenticated/cargo/bookings/$id')({
  component: BookingDetailPage,
  validateSearch: (search: Record<string, unknown>): { from?: 'flight'; flight?: string } => ({
    from: search.from === 'flight' ? 'flight' : undefined,
    flight: typeof search.flight === 'string' && search.flight ? search.flight : undefined,
  }),
})
