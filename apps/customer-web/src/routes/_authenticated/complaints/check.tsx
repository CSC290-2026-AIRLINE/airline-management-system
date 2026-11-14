import { createFileRoute } from '@tanstack/react-router'
import { CheckCasePage } from '@customer-web/features/customer-service/CheckCasePage'

export const Route = createFileRoute('/_authenticated/complaints/check')({
  validateSearch: (search: Record<string, unknown>) => ({
    caseNumber: typeof search.caseNumber === 'string' ? search.caseNumber : undefined,
    bookingRef: typeof search.bookingRef === 'string' ? search.bookingRef : undefined,
    surname: typeof search.surname === 'string' ? search.surname : undefined,
    guest: typeof search.guest === 'string' ? search.guest : undefined,
  }),
  component: CheckCasePage,
})

