import { createFileRoute, redirect } from '@tanstack/react-router'

// The pairing page calls the API, so it lives under `_authenticated` (sign-in and
// `AppAuthProvider`). The root URL only forwards there.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/build-pairings' })
  },
})
