import { createFileRoute, redirect } from '@tanstack/react-router'
import { AppAuthProvider } from '../auth/AuthProvider'
import { PassengerLostBagCasePage } from '../features/baggage/pages/PassengerLostBagCasePage'

/**
 * Outside `_authenticated` (like /report-lost-bag) so the case page does not wait on the profile load: it uses no
 * profile data, and a failed profile load must not hide a bag case.
 */
export const Route = createFileRoute('/lost-bag-case')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isSignedIn) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: LostBagCaseRoute,
})

function LostBagCaseRoute() {
  return (
    <AppAuthProvider>
      <PassengerLostBagCasePage />
    </AppAuthProvider>
  )
}
