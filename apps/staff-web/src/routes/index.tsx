import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    if (context.auth.isSignedIn) {
      throw redirect({ to: '/customer-search', replace: true })
    }
    throw redirect({ to: '/login', replace: true })
  },
})
