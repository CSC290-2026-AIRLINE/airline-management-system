import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/security-screening/')({
  beforeLoad: () => {
    throw redirect({ to: '/security-screening/screening-queue', search: { status: 'needs-review' }, replace: true })
  },
})
