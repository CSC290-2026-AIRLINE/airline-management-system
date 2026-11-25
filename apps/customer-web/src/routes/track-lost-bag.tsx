import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Keep the old guest URL as a redirect: signed-out visitors sign in first, then continue to the authenticated case page.
 */
export const Route = createFileRoute('/track-lost-bag')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isSignedIn) {
      throw redirect({ to: '/login', search: { redirect: '/lost-bag-case' } })
    }
    throw redirect({ to: '/lost-bag-case' })
  },
})
