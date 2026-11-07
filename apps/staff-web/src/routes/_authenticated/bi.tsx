import { createFileRoute } from '@tanstack/react-router'
import { BiDashboardPage } from '@staff-web/features/bi-dashboards/pages/BiDashboardPage'

export const Route = createFileRoute('/_authenticated/bi')({
  component: BiDashboardPage,
})
