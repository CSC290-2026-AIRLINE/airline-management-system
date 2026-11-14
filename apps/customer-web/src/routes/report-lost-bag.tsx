import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { AppAuthProvider } from '../auth/AuthProvider'
import { GuestLostBagReportPage, PassengerLostBagReportPage } from '../features/baggage/pages/PassengerLostBagReportPage'
import { reportingModeFor } from '../features/baggage/pages/lost-report-form'

/**
 * Report a lost bag, for signed-in customers and guests alike. Public on purpose: the reporting mode follows Clerk's
 * sign-in state only. Signed-in customers use AppAuthProvider and the customer flow; an app-session failure never falls
 * back to guest. Signed-out passengers use the guest page and public guest endpoints. The root route supplies SiteHeader.
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
        <PassengerLostBagReportPage />
      </AppAuthProvider>
    )
  }

  if (mode === 'guest') {
    return <GuestLostBagReportPage />
  }

  return null
}
