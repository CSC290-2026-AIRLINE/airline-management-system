import { createFileRoute, Navigate, redirect } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { GuestLostBagCasePage } from '../features/baggage/pages/GuestLostBagCasePage'
import { prefilledCaseNumber } from '../features/baggage/pages/guest-case-tracking'

interface TrackLostBagSearch {
  /** Only the case number may prefill the form; booking reference and surname never travel in the URL. */
  case?: string
}

/**
 * Guest case tracking: public and read only. Signed-in customers already have My bag case (/lost-bag-case), which keeps
 * its authenticated route, guards and actions, so they are sent there instead.
 */
export const Route = createFileRoute('/track-lost-bag')({
  validateSearch: (search: Record<string, unknown>): TrackLostBagSearch => {
    const caseNumber = prefilledCaseNumber(search.case)
    return caseNumber ? { case: caseNumber } : {}
  },
  beforeLoad: ({ context }) => {
    if (context.auth.isSignedIn) throw redirect({ to: '/lost-bag-case' })
  },
  component: TrackLostBagRoute,
})

function TrackLostBagRoute() {
  const { isLoaded, isSignedIn } = useAuth()
  const { case: caseNumber } = Route.useSearch()

  if (!isLoaded) return null
  if (isSignedIn) return <Navigate to="/lost-bag-case" />

  return <GuestLostBagCasePage initialCaseNumber={caseNumber ?? ''} />
}
