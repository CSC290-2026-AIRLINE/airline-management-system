import { createFileRoute } from '@tanstack/react-router'
import { RoutesPage } from '@staff-web/features/flight-scheduling/pages/RoutesPage'

export const Route = createFileRoute('/_authenticated/routes')({
  component: RoutesPage,
})
