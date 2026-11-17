import { createFileRoute } from '@tanstack/react-router'
import { SectionPage } from '@staff-web/features/flight-scheduling/components/SectionPage'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { AirportsPage } from '@staff-web/features/flight-scheduling/pages/AirportsPage'
import { AirportFeesPage } from '@staff-web/features/flight-scheduling/pages/AirportFeesPage'
import { ApprovalPolicyPage } from '@staff-web/features/flight-scheduling/pages/ApprovalPolicyPage'
import { SECTION_TABS } from '@staff-web/features/flight-scheduling/section-tabs'

// The tab is the ?tab= query, so a link or a refresh lands on the same tab.
export const Route = createFileRoute('/_authenticated/airports')({
  validateSearch: (s: Record<string, unknown>) => {
    const tab = SECTION_TABS.airports.find((t) => t === s.tab)
    return tab ? { tab } : {}
  },
  component: Page,
})

function Page() {
  const { tab } = Route.useSearch()
  return (
    <AuthGate>
      <SectionPage section="airports" title="Airports">
        {tab === 'fees' ? <AirportFeesPage /> : tab === 'policy' ? <ApprovalPolicyPage /> : <AirportsPage />}
      </SectionPage>
    </AuthGate>
  )
}
