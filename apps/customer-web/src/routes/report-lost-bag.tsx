import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { AppAuthProvider } from '../auth/AuthProvider'
import { FlythonHeader } from '../components/FlythonHeader'
import { GuestReportHeader } from '../features/baggage/components/GuestReportHeader'
import { GuestLostBagReportPage, PassengerLostBagReportPage } from '../features/baggage/pages/PassengerLostBagReportPage'
import { reportingModeFor } from '../features/baggage/pages/lost-report-form'

/**
 * Report a lost bag, for signed-in customers and guests alike. Public on purpose: the reporting mode follows Clerk's
 * sign-in state only. Signed in: the same AppAuthProvider + FlythonHeader composition as the authenticated layout, and
 * the customer flow (an app-session failure shows that flow's own error; it never falls back to guest). Signed out: the
 * guest-safe header (public links only, no session needed) and the guest page, using only the public guest endpoints.
 */
export const Route = createFileRoute('/report-lost-bag')({
  component: ReportLostBagRoute,
})

function ReportLostBagRoute() {
  const { isLoaded, isSignedIn } = useAuth()
  const mode = reportingModeFor({ isLoaded, isSignedIn })

  if (mode === 'customer') {
    return (
      <AppAuthProvider>
        <FlythonHeader />
        <PassengerLostBagReportPage />
      </AppAuthProvider>
    )
  }

  if (mode === 'guest') {
    return (
      <>
        <GuestReportHeader />
        <GuestLostBagReportPage />
      </>
    )
  }

  return null
}
