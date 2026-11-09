import { createFileRoute, redirect } from '@tanstack/react-router'

/** `/payments` has no page of its own — the lookup is where staff start. */
export const Route = createFileRoute('/_authenticated/payments/')({
  beforeLoad: () => {
    throw redirect({ to: '/payments/lookup' })
  },
})
