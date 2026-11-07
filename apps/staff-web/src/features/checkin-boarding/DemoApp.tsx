import { useState } from 'react'
import { useMockStaffApi } from './api/use-staff-api.ts'
import { CounterPage } from './components/CounterPage.tsx'
import { GatePage } from './components/GatePage.tsx'
import { StaffShell } from './components/StaffShell.tsx'
import type { StaffPage } from './components/shell-nav.ts'
import './styles/tokens.css'

/** The demo shell: the staff screens on the mock API, without Clerk and without a backend. */
export function DemoApp() {
  const api = useMockStaffApi()
  const [page, setPage] = useState<StaffPage>('counter')

  return (
    <StaffShell current={page} onNavigate={setPage} agentName="Pin Rattana" clock={new Date()}>
      {/* The issue list page lands in a later task; until then the demo falls back to the counter. */}
      {page === 'gate' ? <GatePage api={api} /> : <CounterPage api={api} />}
    </StaffShell>
  )
}
