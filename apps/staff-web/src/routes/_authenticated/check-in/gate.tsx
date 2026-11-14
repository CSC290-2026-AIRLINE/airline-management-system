import { createFileRoute } from '@tanstack/react-router'
import { useHttpStaffApi } from '../../../features/checkin-boarding/api/use-staff-api.ts'
import { GatePage } from '../../../features/checkin-boarding/components/GatePage.tsx'
import { PageError } from '../../../features/checkin-boarding/components/PageError.tsx'

export const Route = createFileRoute('/_authenticated/check-in/gate')({
  component: GateRoute,
  errorComponent: PageError,
})

function GateRoute() {
  const api = useHttpStaffApi()
  return <GatePage api={api} />
}
