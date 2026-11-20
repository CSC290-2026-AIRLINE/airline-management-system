import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'

/** Layout for every `/complaints/*` page: the global staff sidebar, whose "Service & Compensation" group links these pages. */
export const Route = createFileRoute('/_authenticated/complaints')({
  component: CustomerServiceWorkspace,
})

function CustomerServiceWorkspace() {
  return (
    <RequireStaff>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireStaff>
  )
}
