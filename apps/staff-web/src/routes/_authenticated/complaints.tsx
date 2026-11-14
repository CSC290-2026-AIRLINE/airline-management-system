import { createFileRoute } from '@tanstack/react-router'
import { F13StaffShell } from '@staff-web/features/customer-service/F13StaffShell'
import { ComplaintsDashboard } from '@staff-web/features/customer-service/ComplaintsDashboard'

/** The complaints inbox inside the Feature 13 dedicated staff sidebar. */
export const Route = createFileRoute('/_authenticated/complaints')({
  component: ComplaintsWorkspace,
})

function ComplaintsWorkspace() {
  return (
    <F13StaffShell>
      <ComplaintsDashboard />
    </F13StaffShell>
  )
}
