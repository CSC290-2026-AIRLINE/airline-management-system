import { SecurityAccessGate } from '@staff-web/features/security-screening/components/SecurityAccessGate'
import { createFileRoute } from '@tanstack/react-router'
import WatchlistPage from '@staff-web/features/watchlist/pages/WatchlistPage'

export const Route = createFileRoute('/_authenticated/security-screening/watchlist')({
  component: () => (
    <SecurityAccessGate>
      <WatchlistPage />
    </SecurityAccessGate>
  ),
})
