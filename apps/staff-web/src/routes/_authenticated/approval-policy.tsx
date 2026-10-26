import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { ApprovalPolicyPage } from '@staff-web/features/flight-scheduling/pages/ApprovalPolicyPage'

export const Route = createFileRoute('/_authenticated/approval-policy')({
  component: () => (
    <AuthGate>
      <ApprovalPolicyPage />
    </AuthGate>
  ),
})
