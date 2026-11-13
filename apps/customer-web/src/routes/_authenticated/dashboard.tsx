import { createFileRoute, redirect } from '@tanstack/react-router'

// Redirect before rendering so this route never mounts a component that navigates from an effect.
export const Route = createFileRoute('/_authenticated/dashboard')({
  beforeLoad: () => {
    throw redirect({ to: '/account/my-profile', replace: true })
  },
})
