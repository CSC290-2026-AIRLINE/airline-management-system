import { createFileRoute } from '@tanstack/react-router'
import { FlightDetailPage } from '@staff-web/features/flight-scheduling/pages/FlightDetailPage'

export const Route = createFileRoute('/_authenticated/flights/$flightId')({
  component: FlightDetailRoute,
})

function FlightDetailRoute() {
  const { flightId } = Route.useParams()
  return <FlightDetailPage flightId={flightId} />
}
