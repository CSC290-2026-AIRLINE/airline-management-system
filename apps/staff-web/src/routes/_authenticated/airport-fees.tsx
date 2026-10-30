import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { AirportFeesPage } from '@staff-web/features/flight-scheduling/pages/AirportFeesPage'

export const Route = createFileRoute('/_authenticated/airport-fees')({
  component: () => (
    <AuthGate>
      <AirportFeesPage />
    </AuthGate>
  ),
})
