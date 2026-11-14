import { createFileRoute } from '@tanstack/react-router'
import { ComplaintSentPage } from '@customer-web/features/customer-service/ComplaintSentPage'

export const Route = createFileRoute('/_authenticated/complaints/sent')({
  validateSearch: (search: Record<string, unknown>) => ({
    caseNumber: typeof search.caseNumber === 'string' ? search.caseNumber : undefined,
    bookingRef: typeof search.bookingRef === 'string' ? search.bookingRef : undefined,
    surname: typeof search.surname === 'string' ? search.surname : undefined,
    guest: typeof search.guest === 'string' ? search.guest : undefined,
  }),
  component: ComplaintSentPage,
})

