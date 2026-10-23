import { createFileRoute } from '@tanstack/react-router'
import { AirportFeesPage } from '@staff-web/features/flight-scheduling/pages/AirportFeesPage'

export const Route = createFileRoute('/_authenticated/airport-fees')({
  component: AirportFeesPage,
})
