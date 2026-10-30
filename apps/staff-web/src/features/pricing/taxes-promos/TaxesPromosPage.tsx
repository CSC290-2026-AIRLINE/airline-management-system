import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PricingShell } from '../components/PricingShell'
import { BaggageRatesCard } from './BaggageRatesCard'
import { PromoCodesCard } from './PromoCodesCard'
import { TaxFeesCard } from './TaxFeesCard'

// One page in the design. The currency and settings cards join here.
export function TaxesPromosPage() {
  // Wait for the session exchange so the first API calls carry a token instead of racing the refresh.
  const { isLoading, accessToken } = useAppAuth()

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
            <TaxFeesCard />
          </ErrorBoundary>
          <ErrorBoundary>
            <BaggageRatesCard />
          </ErrorBoundary>
          <ErrorBoundary>
            <PromoCodesCard />
          </ErrorBoundary>
        </div>
      )}
    </PricingShell>
  )
}
