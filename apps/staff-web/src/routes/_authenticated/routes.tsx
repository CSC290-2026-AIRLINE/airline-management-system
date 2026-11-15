import { createFileRoute } from '@tanstack/react-router'
import { SectionPage } from '@staff-web/features/flight-scheduling/components/SectionPage'
import { AuthGate } from '@staff-web/features/flight-scheduling/components/AuthGate'
import { RoutesPage } from '@staff-web/features/flight-scheduling/pages/RoutesPage'
import { PatternsPage } from '@staff-web/features/flight-scheduling/pages/PatternsPage'
import { SECTION_TABS } from '@staff-web/features/flight-scheduling/section-tabs'

// The tab is the ?tab= query, so a link or a refresh lands on the same tab.
export const Route = createFileRoute('/_authenticated/routes')({
  validateSearch: (s: Record<string, unknown>) => {
    const tab = SECTION_TABS.routes.find((t) => t === s.tab)
    return tab ? { tab } : {}
  },
  component: Page,
})

function Page() {
  const { tab } = Route.useSearch()
  return (
    <AuthGate>
      <SectionPage section="routes" title="Routes">
        {tab === 'patterns' ? <PatternsPage /> : <RoutesPage />}
      </SectionPage>
    </AuthGate>
  )
}
