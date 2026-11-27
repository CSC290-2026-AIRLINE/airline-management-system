import { createFileRoute } from '@tanstack/react-router'
import { FinancePage } from '@staff-web/features/bi-dashboards/pages/FinancePage'

/** The Financial report: Feature 4's monthly revenue, costs and profit. Access and tabs come from the `/bi` layout. */
export const Route = createFileRoute('/_authenticated/bi/finance')({
  component: FinancePage,
})
