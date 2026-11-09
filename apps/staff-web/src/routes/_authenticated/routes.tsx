import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { RoutesPage } from '@staff-web/features/flight-scheduling/pages/RoutesPage'

export const Route = createFileRoute('/_authenticated/routes')({
  component: () => (
    <AuthGate>
      <RoutesPage />
    </AuthGate>
  ),
})
