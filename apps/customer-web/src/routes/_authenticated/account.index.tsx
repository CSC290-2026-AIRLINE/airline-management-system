import { createFileRoute, redirect } from '@tanstack/react-router'

// `/account` has no page of its own; send it to the profile.
export const Route = createFileRoute('/_authenticated/account/')({
  beforeLoad: () => {
    throw redirect({ to: '/account/my-profile', replace: true })
  },
})
