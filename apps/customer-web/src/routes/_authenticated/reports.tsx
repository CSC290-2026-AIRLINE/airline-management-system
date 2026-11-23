import { createFileRoute } from '@tanstack/react-router'
import { ReportsAnalyticsPage } from '@customer-web/features/reports-analytics/ReportsAnalyticsPage'

export const Route = createFileRoute('/_authenticated/reports')({
  component: ReportsAnalyticsPage,
})
