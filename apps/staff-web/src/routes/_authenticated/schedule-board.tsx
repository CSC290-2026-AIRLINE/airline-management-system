import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { ScheduleBoardPage } from '@staff-web/features/flight-scheduling/pages/ScheduleBoardPage'

export const Route = createFileRoute('/_authenticated/schedule-board')({
  component: () => (
    <AuthGate>
      <ScheduleBoardPage />
    </AuthGate>
  ),
})
