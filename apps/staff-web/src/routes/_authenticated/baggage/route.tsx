import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { BaggageLayout } from '@staff-web/features/baggage/BaggageLayout'

/**
 * Layout for every `/baggage/*` page (Feature 10, lost and found baggage): the global staff sidebar around the F10 page
 * column. The backend checks for an active staff account on every call.
 */
export const Route = createFileRoute('/_authenticated/baggage')({
  component: BaggageWorkspace,
})

function BaggageWorkspace() {
  return (
    <RequireStaff>
      <AppShell>
        <BaggageLayout>
          <Outlet />
        </BaggageLayout>
      </AppShell>
    </RequireStaff>
  )
}
