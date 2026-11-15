import { createFileRoute, redirect } from '@tanstack/react-router'

// The settings are a tab of the schedule flight page now; this keeps old links working.
export const Route = createFileRoute('/_authenticated/settings')({
  beforeLoad: () => {
    throw redirect({ to: '/schedule-board', search: { tab: 'settings' }, replace: true })
  },
})
