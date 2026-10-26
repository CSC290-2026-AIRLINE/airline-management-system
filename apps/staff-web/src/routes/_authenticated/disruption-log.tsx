import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { DisruptionLogPage } from '@staff-web/features/flight-scheduling/pages/DisruptionLogPage'

export const Route = createFileRoute('/_authenticated/disruption-log')({
  component: () => (
    <AuthGate>
      <DisruptionLogPage />
    </AuthGate>
  ),
})
