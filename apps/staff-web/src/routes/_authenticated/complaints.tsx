import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { ComplaintsDashboard } from '@staff-web/features/customer-service/ComplaintsDashboard'

/** The complaints inbox inside the global staff sidebar, like every other staff workspace. */
export const Route = createFileRoute('/_authenticated/complaints')({
  component: ComplaintsWorkspace,
})

function ComplaintsWorkspace() {
  return (
    <RequireStaff>
      <AppShell>
        <ComplaintsDashboard />
      </AppShell>
    </RequireStaff>
  )
}
