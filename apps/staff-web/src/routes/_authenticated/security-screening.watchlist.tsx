import { SecurityAccessGate } from '@staff-web/features/security-screening/components/SecurityAccessGate'
import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import WatchlistPage from '@staff-web/features/watchlist/pages/WatchlistPage'

export const Route = createFileRoute('/_authenticated/security-screening/watchlist')({
  component: () => (
    <RequireStaff>
      <AppShell>
        <SecurityAccessGate>
          <WatchlistPage />
        </SecurityAccessGate>
      </AppShell>
    </RequireStaff>
  ),
})
