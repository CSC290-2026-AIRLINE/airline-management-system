import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { ApprovalsPage } from '@staff-web/features/flight-scheduling/pages/ApprovalsPage'

export const Route = createFileRoute('/_authenticated/approvals')({
  component: () => (
    <AuthGate>
      <ApprovalsPage />
    </AuthGate>
  ),
})
