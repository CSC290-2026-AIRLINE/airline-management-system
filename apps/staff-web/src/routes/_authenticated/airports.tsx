import { createFileRoute } from '@tanstack/react-router'
import { AirportsPage } from '@staff-web/features/flight-scheduling/pages/AirportsPage'

export const Route = createFileRoute('/_authenticated/airports')({
  component: AirportsPage,
})
