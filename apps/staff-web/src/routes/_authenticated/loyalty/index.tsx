import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/loyalty/')({
  beforeLoad: () => {
    throw redirect({ to: '/loyalty/members' })
  },
})
