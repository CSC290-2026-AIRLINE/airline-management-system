import { createFileRoute } from '@tanstack/react-router'
import { MonthlyReportPage } from '@staff-web/features/pricing/finance/MonthlyReportPage'

export const Route = createFileRoute('/_authenticated/pricing/monthly-report')({
  component: MonthlyReportPage,
})
