import { createFileRoute } from '@tanstack/react-router'
import { FlightsPage } from '@staff-web/features/flight-scheduling/FlightsPage'

export const Route = createFileRoute('/_authenticated/flights')({
  component: FlightsPage,
})
