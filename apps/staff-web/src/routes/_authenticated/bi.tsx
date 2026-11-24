import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { BiDashboardPage } from '@staff-web/features/bi-dashboards/pages/BiDashboardPage'

/** The Business intelligence pages, inside the main staff sidebar like every other feature. */
export const Route = createFileRoute('/_authenticated/bi')({
  component: BiRoute,
})

function BiRoute() {
  return (
    <RequireStaff>
      <AppShell>
        <BiDashboardPage />
      </AppShell>
    </RequireStaff>
  )
}
