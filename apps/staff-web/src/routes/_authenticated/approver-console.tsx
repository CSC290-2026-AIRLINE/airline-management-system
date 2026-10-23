import { createFileRoute } from '@tanstack/react-router'
import { ApproverConsolePage } from '@staff-web/features/flight-scheduling/pages/ApproverConsolePage'

export const Route = createFileRoute('/_authenticated/approver-console')({
  component: ApproverConsolePage,
})
