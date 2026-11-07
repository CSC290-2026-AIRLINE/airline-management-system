import { useState } from 'react'
import { useMockStaffApi } from './api/use-staff-api.ts'
import { CounterPage } from './components/CounterPage.tsx'
import { GatePage } from './components/GatePage.tsx'
import { IssueListPage } from './components/IssueListPage.tsx'
import { StaffShell } from './components/StaffShell.tsx'
import type { StaffPage } from './components/shell-nav.ts'

/** The demo shell: the staff screens on the mock API, without Clerk and without a backend. */
export function DemoApp() {
  const api = useMockStaffApi()
  const [page, setPage] = useState<StaffPage>('counter')
  const agentName = 'Pim Rattana'

  /** The counter reads ?checkIn= on mount, so the passenger opens straight away. */
  const openPassenger = (checkInId: string) => {
    window.history.replaceState(null, '', `/check-in/counter?checkIn=${checkInId}`)
    setPage('counter')
  }

  return (
    <StaffShell current={page} onNavigate={setPage} agentName={agentName} clock={new Date()}>
      {page === 'gate' ? (
        <GatePage api={api} />
      ) : page === 'issues' ? (
        <IssueListPage api={api} agentName={agentName} onOpenPassenger={openPassenger} />
      ) : (
        <CounterPage api={api} />
      )}
    </StaffShell>
  )
}
