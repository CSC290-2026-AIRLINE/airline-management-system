import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { CheckInLayout } from '@staff-web/features/checkin-boarding/components/CheckInLayout.tsx'

/** Layout for every `/check-in/*` page: the global staff sidebar around the F6 page column. */
export const Route = createFileRoute('/_authenticated/check-in')({
  component: CheckInWorkspace,
})

function CheckInWorkspace() {
  return (
    <RequireStaff>
      <AppShell>
        <CheckInLayout>
          <Outlet />
        </CheckInLayout>
      </AppShell>
    </RequireStaff>
  )
}
