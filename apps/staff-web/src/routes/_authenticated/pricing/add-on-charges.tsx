import { createFileRoute } from '@tanstack/react-router'
import { AddOnChargesPage } from '@staff-web/features/pricing/add-on-charges/AddOnChargesPage'
import { isAddOnTab, type AddOnTab } from '@staff-web/features/pricing/add-on-charges/tabs'

export const Route = createFileRoute('/_authenticated/pricing/add-on-charges')({
  // Optional, so links to the page need no search params; a missing or unknown tab opens Seat fees.
  validateSearch: (search: Record<string, unknown>): { tab?: AddOnTab } => (isAddOnTab(search.tab) ? { tab: search.tab } : {}),
  component: AddOnChargesRoute,
})

function AddOnChargesRoute() {
  const { tab = 'seat-fees' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <AddOnChargesPage tab={tab} onTabChange={(next) => void navigate({ search: { tab: next } })} />
}
