import { createFileRoute } from '@tanstack/react-router'
import { FlightCargoPage } from '@staff-web/features/cargo/FlightCargoPage'

export const Route = createFileRoute('/_authenticated/cargo/flights')({
  component: FlightCargoPage,
})
