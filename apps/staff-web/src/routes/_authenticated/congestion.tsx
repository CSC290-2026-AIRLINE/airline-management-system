import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { CongestionPage } from '@staff-web/features/flight-scheduling/pages/CongestionPage'

export const Route = createFileRoute('/_authenticated/congestion')({
  component: () => (
    <AuthGate>
      <CongestionPage />
    </AuthGate>
  ),
})
