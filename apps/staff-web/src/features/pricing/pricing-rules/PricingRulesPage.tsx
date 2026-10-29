import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type { RuleGroup } from '../api'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PricingShell } from '../components/PricingShell'
import { RulesCard } from './RulesCard'
import { SeatFeesCard } from './SeatFeesCard'

interface PricingRulesPageProps {
  group: RuleGroup
  onGroupChange: (group: RuleGroup) => void
}

export function PricingRulesPage({ group, onGroupChange }: PricingRulesPageProps) {
  // Wait for the session exchange so the first API calls carry a token instead of racing the refresh.
  const { isLoading, accessToken } = useAppAuth()

  return (
    <PricingShell
      title="Pricing rules"
      description="Within a group the first matching rule wins. Winners of different groups multiply onto the base fare."
      actions={
        // The simulator is not built yet.
        <button type="button" className="pr-button is-outline" disabled title="Coming soon">
          Open price simulator
        </button>
      }
    >
      {isLoading ? (
        <p className="pr-state">Signing in…</p>
      ) : !accessToken ? (
        <div className="pr-callout is-error" role="alert">
          Your session could not be started. Sign out and sign in again.
        </div>
      ) : (
        <div className="pr-stack">
          <ErrorBoundary>
            <RulesCard group={group} onGroupChange={onGroupChange} />
          </ErrorBoundary>
          <ErrorBoundary>
            <SeatFeesCard />
          </ErrorBoundary>
        </div>
      )}
    </PricingShell>
  )
}
