import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'

/** Layout for every `/cargo/*` page: the global staff sidebar around the page. */
export const Route = createFileRoute('/_authenticated/cargo')({
  component: CargoWorkspace,
})

function CargoWorkspace() {
  return (
    <RequireStaff>
      <AppShell>
        <div className="flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </AppShell>
    </RequireStaff>
  )
}
