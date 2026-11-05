import { useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PricingShell } from '../components/PricingShell'
import { CurrencyRatesCard } from '../currency-rates/CurrencyRatesCard'
import { BaggageRatesCard } from './BaggageRatesCard'
import { PromoCodesCard } from './PromoCodesCard'
import { RedeemQuoteCard } from './RedeemQuoteCard'
import { SettingsCard } from './SettingsCard'
import { TaxFeesCard } from './TaxFeesCard'

// One page in the design, in its order. The Redeem card is not in the design: it stays until Feature 3b redeems on booking.
export function TaxesPromosPage() {
  // Wait for the session exchange so the first API calls carry a token instead of racing the refresh.
  const { isLoading, accessToken } = useAppAuth()
  const [redeems, setRedeems] = useState(0)

  return (
    <PricingShell
      title="Taxes, currency & promos"
      description="Taxes and fees added after the fare, display-only currency rates, overweight baggage rates, promo codes and pricing settings."
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
            <SettingsCard />
          </ErrorBoundary>
          <ErrorBoundary>
            <TaxFeesCard />
          </ErrorBoundary>
          <ErrorBoundary>
            <CurrencyRatesCard />
          </ErrorBoundary>
          <ErrorBoundary>
            <BaggageRatesCard />
          </ErrorBoundary>
          <ErrorBoundary>
            <PromoCodesCard refreshKey={redeems} />
          </ErrorBoundary>
          <ErrorBoundary>
            <RedeemQuoteCard onRedeemed={() => setRedeems((count) => count + 1)} />
          </ErrorBoundary>
        </div>
      )}
    </PricingShell>
  )
}
