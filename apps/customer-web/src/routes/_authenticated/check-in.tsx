import { createFileRoute } from '@tanstack/react-router'
import { useAppAuth } from '../../auth/AuthProvider'
import { useCheckInApi } from '../../features/checkin-boarding/api/use-check-in-api.ts'
import { CheckInFlow } from '../../features/checkin-boarding/components/CheckInFlow.tsx'

export const Route = createFileRoute('/_authenticated/check-in')({
  component: CheckInPage,
})

function CheckInPage() {
  const { fetchWithAuth } = useAppAuth()
  const api = useCheckInApi(fetchWithAuth)

  return <CheckInFlow api={api} />
}
