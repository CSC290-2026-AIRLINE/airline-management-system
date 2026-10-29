import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PricingShell } from '../components/PricingShell'
import { BaseFaresTab } from './BaseFaresTab'
import { FareClassesTab } from './FareClassesTab'
import { FARE_SETUP_TABS, type FareSetupTab } from './tabs'

const TAB_LABELS: Record<FareSetupTab, string> = { 'fare-classes': 'Fare classes', 'base-fares': 'Base fares' }

interface FareSetupPageProps {
  tab: FareSetupTab
  onTabChange: (tab: FareSetupTab) => void
}

export function FareSetupPage({ tab, onTabChange }: FareSetupPageProps) {
  // Wait for the session exchange so the first API calls carry a token instead of racing the refresh.
  const { isLoading, accessToken } = useAppAuth()

  return (
    <PricingShell title="Fare Setup" description="Fare classes, their restrictions and fee rules, and the base fare for each route.">
      <div className="pr-tabs" role="tablist" aria-label="Fare setup sections">
        {FARE_SETUP_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            className={`pr-button ${tab === id ? 'is-primary' : 'is-outline'}`}
            onClick={() => onTabChange(id)}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {isLoading ? (
          <p className="pr-state">Signing in…</p>
        ) : !accessToken ? (
          <div className="pr-callout is-error" role="alert">
            Your session could not be started. Sign out and sign in again.
          </div>
        ) : (
          <ErrorBoundary key={tab}>{tab === 'fare-classes' ? <FareClassesTab /> : <BaseFaresTab />}</ErrorBoundary>
        )}
      </div>
    </PricingShell>
  )
}
