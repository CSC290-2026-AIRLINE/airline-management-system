import { createFileRoute } from '@tanstack/react-router'
import { ComplaintSentPage } from '../../features/customer-service/ComplaintSentPage'

export const Route = createFileRoute('/complaints/sent')({
  validateSearch: (search: Record<string, unknown>) => ({
    caseId: typeof search.caseId === 'string' ? search.caseId : undefined,
  }),
  component: ComplaintSentPage,
})
