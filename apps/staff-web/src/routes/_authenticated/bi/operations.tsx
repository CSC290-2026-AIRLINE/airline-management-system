import { createFileRoute } from '@tanstack/react-router'
import { OperationsView } from '@staff-web/features/bi-dashboards/pages/OperationsPage'

/** The Operations dashboard: on-time, load factor, revenue per seat and bookings. Access and tabs come from the `/bi` layout. */
export const Route = createFileRoute('/_authenticated/bi/operations')({
  component: OperationsView,
})
