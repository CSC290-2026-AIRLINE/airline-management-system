import { createFileRoute, redirect } from '@tanstack/react-router'
import { AppAuthProvider } from '../auth/AuthProvider'
import { PassengerLostBagReportPage } from '../features/baggage/pages/PassengerLostBagReportPage'

export const Route = createFileRoute('/report-lost-bag')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isSignedIn) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: ReportLostBagRoute,
})

function ReportLostBagRoute() {
  return (
    <AppAuthProvider>
      <PassengerLostBagReportPage />
    </AppAuthProvider>
  )
}
