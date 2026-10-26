import { createFileRoute, redirect } from '@tanstack/react-router'
import { validateQueueSearch } from '@staff-web/features/security-screening/queue-search'

export const Route = createFileRoute('/_authenticated/screening-queue')({
  validateSearch: validateQueueSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/security-screening/screening-queue', search, replace: true })
  },
})
