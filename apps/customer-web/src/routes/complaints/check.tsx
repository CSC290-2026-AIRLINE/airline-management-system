import { createFileRoute } from '@tanstack/react-router'
import { CheckCasePage } from '../../features/customer-service/CheckCasePage'

export const Route = createFileRoute('/complaints/check')({
  validateSearch: (search: Record<string, unknown>) => ({
    caseId: typeof search.caseId === 'string' ? search.caseId : undefined,
  }),
  component: CheckCasePage,
})

