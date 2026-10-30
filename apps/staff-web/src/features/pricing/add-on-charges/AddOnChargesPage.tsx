import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PricingShell } from '../components/PricingShell'
import { BaggageRatesTab } from './BaggageRatesTab'
import { SeatFeesTab } from './SeatFeesTab'
import { ADD_ON_TABS, type AddOnTab } from './tabs'
import './add-on-charges.css'

const TAB_LABELS: Record<AddOnTab, string> = { 'seat-fees': 'Seat fees', 'baggage-rates': 'Baggage rates' }

function tabPanel(tab: AddOnTab) {
  switch (tab) {
    case 'seat-fees':
      return <SeatFeesTab />
    case 'baggage-rates':
      return <BaggageRatesTab />
    default: {
      const unknown: never = tab
      return unknown
    }
  }
}

interface AddOnChargesPageProps {
  tab: AddOnTab
  onTabChange: (tab: AddOnTab) => void
}

export function AddOnChargesPage({ tab, onTabChange }: AddOnChargesPageProps) {
  // Wait for the session exchange so the first API calls carry a token instead of racing the refresh.
  const { isLoading, accessToken } = useAppAuth()

  return (
    <PricingShell title="Add-on Charges" description="Seat fees and overweight baggage rates.">
      <div className="pr-tabs" role="tablist" aria-label="Add-on charge sections">
        {ADD_ON_TABS.map((id) => (
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
          <ErrorBoundary key={tab}>{tabPanel(tab)}</ErrorBoundary>
        )}
      </div>
    </PricingShell>
  )
}
