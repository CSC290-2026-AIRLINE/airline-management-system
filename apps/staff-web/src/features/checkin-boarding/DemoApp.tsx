import { useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { cn } from '@staff-web/lib/utils'
import { useMockStaffApi } from './api/use-staff-api.ts'
import { CheckInLayout } from './components/CheckInLayout.tsx'
import { CounterPage } from './components/CounterPage.tsx'
import { GatePage } from './components/GatePage.tsx'
import { IssueListPage } from './components/IssueListPage.tsx'
import { CHIP_ACTIVE, CHIP_IDLE } from './components/styles.ts'

type DemoPage = 'counter' | 'issues' | 'gate'

const PAGES: { page: DemoPage; label: string }[] = [
  { page: 'counter', label: 'Check-in counter' },
  { page: 'issues', label: 'Issue list' },
  { page: 'gate', label: 'Gate' },
]

/**
 * The staff screens on the mock API, without Clerk and without a backend. There is no router or staff session here,
 * so the global sidebar (`AppShell`) cannot render; a row of buttons switches pages instead.
 */
export function DemoApp() {
  const api = useMockStaffApi()
  const [page, setPage] = useState<DemoPage>('counter')
  const agentName = 'Pim Rattana'

  /** The counter reads ?checkIn= on mount, so the passenger opens straight away. */
  const openPassenger = (checkInId: string) => {
    window.history.replaceState(null, '', `/check-in/counter?checkIn=${checkInId}`)
    setPage('counter')
  }

  return (
    <div className="admin-shell min-h-svh bg-page font-sans text-foreground [color-scheme:light]">
      <CheckInLayout>
        <nav aria-label="Demo pages" className="flex gap-2 print:hidden">
          {PAGES.map((p) => (
            <Button
              key={p.page}
              variant="outline"
              aria-current={page === p.page ? 'page' : undefined}
              onClick={() => setPage(p.page)}
              className={cn(page === p.page ? CHIP_ACTIVE : CHIP_IDLE)}
            >
              {p.label}
            </Button>
          ))}
        </nav>
        {page === 'gate' ? (
          <GatePage api={api} />
        ) : page === 'issues' ? (
          <IssueListPage api={api} agentName={agentName} onOpenPassenger={openPassenger} />
        ) : (
          <CounterPage api={api} />
        )}
      </CheckInLayout>
    </div>
  )
}
