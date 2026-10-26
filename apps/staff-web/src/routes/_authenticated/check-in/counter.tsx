import { createFileRoute } from '@tanstack/react-router'
import { useHttpStaffApi } from '../../../features/checkin-boarding/api/use-staff-api.ts'
import { CounterPage } from '../../../features/checkin-boarding/components/CounterPage.tsx'

export const Route = createFileRoute('/_authenticated/check-in/counter')({
  component: CounterRoute,
})

function CounterRoute() {
  const api = useHttpStaffApi()
  return <CounterPage api={api} />
}
