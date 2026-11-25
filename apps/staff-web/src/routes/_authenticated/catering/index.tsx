import { createFileRoute, redirect } from '@tanstack/react-router'

// /catering has no page of its own — bounce straight to the catalog.
export const Route = createFileRoute('/_authenticated/catering/')({
  beforeLoad: () => {
    throw redirect({ to: '/catering/catalog' })
  },
})
