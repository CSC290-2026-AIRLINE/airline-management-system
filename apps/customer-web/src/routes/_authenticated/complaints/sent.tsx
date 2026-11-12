import { createFileRoute } from '@tanstack/react-router'
import { ComplaintSentPage } from '@customer-web/features/customer-service/ComplaintSentPage'

export const Route = createFileRoute('/_authenticated/complaints/sent')({
  validateSearch: (search: Record<string, unknown>) => ({
    caseNumber: typeof search.caseNumber === 'string' ? search.caseNumber : undefined,
  }),
  component: ComplaintSentPage,
})
