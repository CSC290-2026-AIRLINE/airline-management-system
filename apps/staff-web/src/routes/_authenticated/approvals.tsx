import { createFileRoute } from '@tanstack/react-router'
import { ApprovalsPage } from '@staff-web/features/flight-scheduling/pages/ApprovalsPage'

export const Route = createFileRoute('/_authenticated/approvals')({
  component: ApprovalsPage,
})
