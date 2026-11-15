import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { SimClockPill } from '@staff-web/features/crew-rostering/shared/sim-clock-pill'

/**
 * Layout for every crew-rostering page: the global staff sidebar around the page. Pathless (`_crew`), so the pages keep
 * their top-level URLs (`/build-pairings`, `/setup-crew`, ...).
 */
export const Route = createFileRoute('/_authenticated/_crew')({
  component: CrewWorkspace,
})

function CrewWorkspace() {
  return (
    <RequireStaff>
      <AppShell mobileHeader="card">
        {/* Phone only: from `lg` up the sidebar has room for the clock. */}
        <div className="px-4 pt-3 empty:hidden lg:hidden">
          <SimClockPill />
        </div>
        <Outlet />
      </AppShell>
    </RequireStaff>
  )
}
