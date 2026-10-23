import { createFileRoute } from '@tanstack/react-router'
import { ApprovalPolicyPage } from '@staff-web/features/flight-scheduling/pages/ApprovalPolicyPage'

export const Route = createFileRoute('/_authenticated/approval-policy')({
  component: ApprovalPolicyPage,
})
