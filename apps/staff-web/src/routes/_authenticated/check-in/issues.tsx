import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { useHttpStaffApi } from '../../../features/checkin-boarding/api/use-staff-api.ts'
import { IssueListPage } from '../../../features/checkin-boarding/components/IssueListPage.tsx'

export const Route = createFileRoute('/_authenticated/check-in/issues')({
  component: IssuesRoute,
})

function IssuesRoute() {
  const api = useHttpStaffApi()
  const navigate = useNavigate()
  const { user } = useAppAuth()

  return (
    <IssueListPage
      api={api}
      agentName={user?.email ?? 'Staff agent'}
      /* The counter reads ?checkIn= on mount, so the passenger opens straight away. */
      onOpenPassenger={(id) => void navigate({ to: '/check-in/counter', search: { checkIn: id } })}
    />
  )
}
