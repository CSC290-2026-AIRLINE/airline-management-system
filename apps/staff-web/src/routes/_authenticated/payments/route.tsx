import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'

/** Layout for every `/payments/*` page (Feature 5): the global staff sidebar around the page. */
export const Route = createFileRoute('/_authenticated/payments')({
  component: PaymentsWorkspace,
})

function PaymentsWorkspace() {
  return (
    <RequireStaff>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireStaff>
  )
}
