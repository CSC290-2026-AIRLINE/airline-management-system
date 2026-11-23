import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'

/** Layout for every `/pricing/*` page: the global staff sidebar around the page. */
export const Route = createFileRoute('/_authenticated/pricing')({
  component: PricingWorkspace,
})

function PricingWorkspace() {
  return (
    <RequireStaff>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireStaff>
  )
}
