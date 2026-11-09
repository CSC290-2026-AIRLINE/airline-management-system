import { createFileRoute } from '@tanstack/react-router'
import { BookingLookupPage } from '../../features/booking-pnr/pages/BookingLookupPage'

export const Route = createFileRoute('/_authenticated/booking-lookup')({
  validateSearch: (search: Record<string, unknown>): { reference?: string } => ({
    reference:
      typeof search.reference === 'string' && /^[A-HJ-NP-Z2-9]{6}$/i.test(search.reference.trim())
        ? search.reference.trim().toUpperCase()
        : undefined,
  }),
  component: BookingLookupPage,
})
