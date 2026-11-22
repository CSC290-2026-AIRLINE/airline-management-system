import { createFileRoute } from '@tanstack/react-router'
import { FareSetupPage } from '@staff-web/features/pricing/fare-setup/FareSetupPage'
import { isFareSetupTab, type FareSetupTab } from '@staff-web/features/pricing/fare-setup/tabs'

export const Route = createFileRoute('/_authenticated/pricing/fare-setup')({
  // Optional, so links to the page need no search params; a missing or unknown tab opens Fare classes.
  validateSearch: (search: Record<string, unknown>): { tab?: FareSetupTab } => (isFareSetupTab(search.tab) ? { tab: search.tab } : {}),
  component: FareSetupRoute,
})

function FareSetupRoute() {
  const { tab = 'fare-classes' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <FareSetupPage tab={tab} onTabChange={(next) => void navigate({ search: { tab: next } })} />
}
