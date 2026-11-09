import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { AirportsPage } from '@staff-web/features/flight-scheduling/pages/AirportsPage'

export const Route = createFileRoute('/_authenticated/airports')({
  component: () => (
    <AuthGate>
      <AirportsPage />
    </AuthGate>
  ),
})
