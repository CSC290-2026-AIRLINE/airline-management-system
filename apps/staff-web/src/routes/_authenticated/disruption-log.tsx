import { createFileRoute, redirect } from '@tanstack/react-router'

// The disruption log is a tab of the schedule flight page now; this keeps old links working.
export const Route = createFileRoute('/_authenticated/disruption-log')({
  beforeLoad: () => {
    throw redirect({ to: '/schedule-board', search: { tab: 'disruptions' }, replace: true })
  },
})
