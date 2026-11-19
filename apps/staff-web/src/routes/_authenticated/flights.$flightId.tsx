import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { FlightDetailPage } from '@staff-web/features/flight-scheduling/pages/FlightDetailPage'

export const Route = createFileRoute('/_authenticated/flights/$flightId')({
  component: FlightDetailRoute,
})

function FlightDetailRoute() {
  const { flightId } = Route.useParams()
  return (
    <AuthGate>
      <FlightDetailPage flightId={flightId} />
    </AuthGate>
  )
}
