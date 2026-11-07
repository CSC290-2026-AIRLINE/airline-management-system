import { createFileRoute } from '@tanstack/react-router'
import { useHttpStaffApi } from '../../../features/checkin-boarding/api/use-staff-api.ts'
import { CounterPage } from '../../../features/checkin-boarding/components/CounterPage.tsx'

interface CounterSearch {
  checkIn?: string
}

export const Route = createFileRoute('/_authenticated/check-in/counter')({
  /* The issue list opens a passenger here, so the route carries its check-in id. */
  validateSearch: (search: Record<string, unknown>): CounterSearch => ({
    checkIn: typeof search.checkIn === 'string' ? search.checkIn : undefined,
  }),
  component: CounterRoute,
})

function CounterRoute() {
  const api = useHttpStaffApi()
  return <CounterPage api={api} />
}
