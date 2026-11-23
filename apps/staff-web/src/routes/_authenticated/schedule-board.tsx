import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { SectionPage } from '@staff-web/features/flight-scheduling/components/SectionPage'
import { ApprovalsPage } from '@staff-web/features/flight-scheduling/pages/ApprovalsPage'
import { ApproverConsolePage } from '@staff-web/features/flight-scheduling/pages/ApproverConsolePage'
import { ConflictsPage } from '@staff-web/features/flight-scheduling/pages/ConflictsPage'
import { DisruptionLogPage } from '@staff-web/features/flight-scheduling/pages/DisruptionLogPage'
import { SettingsPage } from '@staff-web/features/flight-scheduling/pages/SettingsPage'
import { ScheduleBoardPage } from '@staff-web/features/flight-scheduling/pages/ScheduleBoardPage'
import { SECTION_TABS } from '@staff-web/features/flight-scheduling/section-tabs'

// The tab is the ?tab= query, so a link or a refresh lands on the same tab.
export const Route = createFileRoute('/_authenticated/schedule-board')({
  validateSearch: (s: Record<string, unknown>) => {
    const tab = SECTION_TABS.board.find((t) => t === s.tab)
    return tab ? { tab } : {}
  },
  component: Page,
})

function Page() {
  const { tab } = Route.useSearch()
  return (
    <AuthGate>
      <SectionPage
        section="board"
        title="Schedule flight"
        action={
          <Button asChild>
            <Link to="/generate-flights">Generate flights</Link>
          </Button>
        }
      >
        {tab === 'approvals' ? (
          <ApprovalsPage />
        ) : tab === 'conflicts' ? (
          <ConflictsPage />
        ) : tab === 'disruptions' ? (
          <DisruptionLogPage />
        ) : tab === 'settings' ? (
          <SettingsPage />
        ) : tab === 'console' ? (
          <ApproverConsolePage />
        ) : (
          <ScheduleBoardPage />
        )}
      </SectionPage>
    </AuthGate>
  )
}
