import { createFileRoute } from '@tanstack/react-router'
import type { RuleGroup } from '@staff-web/features/pricing/api'
import { PricingRulesPage } from '@staff-web/features/pricing/pricing-rules/PricingRulesPage'
import { isRuleGroup } from '@staff-web/features/pricing/pricing-rules/groups'

export const Route = createFileRoute('/_authenticated/pricing/pricing-rules')({
  // Optional, so links to the page need no search params; a missing or unknown group opens Urgency.
  validateSearch: (search: Record<string, unknown>): { group?: RuleGroup } => (isRuleGroup(search.group) ? { group: search.group } : {}),
  component: PricingRulesRoute,
})

function PricingRulesRoute() {
  const { group = 'urgency' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <PricingRulesPage group={group} onGroupChange={(next) => void navigate({ search: { group: next } })} />
}
