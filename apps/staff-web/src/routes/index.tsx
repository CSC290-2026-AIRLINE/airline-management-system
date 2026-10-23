import { createFileRoute, redirect } from '@tanstack/react-router'

// The staff portal opens on the schedule board. Signed-out visitors are sent on to /login by the _authenticated layout.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/schedule-board' })
  },
})
