import { createFileRoute } from '@tanstack/react-router'
import { CheckCasePage } from '@customer-web/features/customer-service/CheckCasePage'

export const Route = createFileRoute('/_authenticated/complaints/check')({
  validateSearch: (search: Record<string, unknown>) => ({
    caseNumber: typeof search.caseNumber === 'string' ? search.caseNumber : undefined,
  }),
  component: CheckCasePage,
})
