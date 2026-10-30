import { useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type { RuleGroup } from '../api'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PricingShell } from '../components/PricingShell'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { RulesCard } from './RulesCard'
import { SeatFeesCard } from './SeatFeesCard'
import { SimulatorCard } from './SimulatorCard'

interface PricingRulesPageProps {
  group: RuleGroup
  onGroupChange: (group: RuleGroup) => void
}

export function PricingRulesPage({ group, onGroupChange }: PricingRulesPageProps) {
  // Wait for the session exchange so the first API calls carry a token instead of racing the refresh.
  const { isLoading, accessToken } = useAppAuth()
  const isPhone = useMediaQuery(PHONE_QUERY)
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  // Goes up after a rule or seat fee changes, so an open simulator recalculates.
  const [changes, setChanges] = useState(0)
  const handleChanged = () => setChanges((count) => count + 1)

  function simulator(variant: 'panel' | 'page') {
    return (
      <ErrorBoundary>
        <SimulatorCard variant={variant} refreshKey={changes} onClose={() => setSimulatorOpen(false)} />
      </ErrorBoundary>
    )
  }

  return (
    <PricingShell
      title="Pricing rules"
      description="Within a group the first matching rule wins. Winners of different groups multiply onto the base fare."
      actions={
        !simulatorOpen && (
          <button type="button" className="pr-button is-outline" onClick={() => setSimulatorOpen(true)}>
            Open price simulator
          </button>
        )
      }
    >
      {isLoading ? (
        <p className="pr-state">Signing in…</p>
      ) : !accessToken ? (
        <div className="pr-callout is-error" role="alert">
          Your session could not be started. Sign out and sign in again.
        </div>
      ) : isPhone && simulatorOpen ? (
        // Phone: the simulator is its own page; "‹ Pricing rules" goes back.
        simulator('page')
      ) : (
        <div className="pr-stack">
          <div className={`pr-rules-layout${simulatorOpen ? ' has-simulator' : ''}`}>
            <div>
              <ErrorBoundary>
                <RulesCard group={group} onGroupChange={onGroupChange} onChanged={handleChanged} />
              </ErrorBoundary>
            </div>
            {simulatorOpen && simulator('panel')}
          </div>
          <ErrorBoundary>
            <SeatFeesCard onChanged={handleChanged} />
          </ErrorBoundary>
        </div>
      )}
    </PricingShell>
  )
}
