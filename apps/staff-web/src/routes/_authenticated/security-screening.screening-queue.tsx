import { SecurityAccessGate } from '@staff-web/features/security-screening/components/SecurityAccessGate'
import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { ScreeningQueue } from '@staff-web/features/security-screening/ScreeningQueue'
import { validateQueueSearch } from '@staff-web/features/security-screening/queue-search'

export const Route = createFileRoute('/_authenticated/security-screening/screening-queue')({
  validateSearch: validateQueueSearch,
  component: ScreeningQueueRoute,
})

function ScreeningQueueRoute() {
  return (
    <RequireStaff>
      <AppShell>
        <SecurityAccessGate>
          <ScreeningQueue />
        </SecurityAccessGate>
      </AppShell>
    </RequireStaff>
  )
}
