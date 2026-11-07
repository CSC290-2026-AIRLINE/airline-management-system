import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/baggage/')({
  beforeLoad: () => {
    throw redirect({ to: '/baggage/lost-bag-cases' })
  },
})
