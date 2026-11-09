import { createFileRoute } from '@tanstack/react-router'
import { HoldExpiredPage } from '../../features/booking-pnr/hold-expired/HoldExpiredPage'
import type { HoldExpiredReason } from '../../features/booking-pnr/hold-expired/types'

interface HoldExpiredSearch {
  reason?: HoldExpiredReason
}

export const Route = createFileRoute('/_authenticated/hold-expired/$reference')({
  validateSearch: (search: Record<string, unknown>): HoldExpiredSearch => {
    const reason = search.reason
    return reason === 'expired' || reason === 'cancelled' || reason === 'refunded' ? { reason } : {}
  },
  component: HoldExpiredRoute,
})

function HoldExpiredRoute() {
  const { reference } = Route.useParams()
  const { reason } = Route.useSearch()
  return <HoldExpiredPage key={reference} reference={reference} reason={reason ?? 'expired'} />
}
