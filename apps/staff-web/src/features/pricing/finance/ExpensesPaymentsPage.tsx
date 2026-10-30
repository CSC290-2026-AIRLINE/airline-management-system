import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PricingShell } from '../components/PricingShell'
import { PaymentScheduleCard } from './PaymentScheduleCard'

// One page in the design. Only the payment schedule is built so far; the month picker, cost cards and expenses join in Step 3.
export function ExpensesPaymentsPage() {
  // Wait for the session exchange so the first API calls carry a token instead of racing the refresh.
  const { isLoading, accessToken } = useAppAuth()

  return (
    <PricingShell title="Expenses & payments" description="Record what the airline spends and schedule what it still has to pay.">
      {isLoading ? (
        <p className="pr-state">Signing in…</p>
      ) : !accessToken ? (
        <div className="pr-callout is-error" role="alert">
          Your session could not be started. Sign out and sign in again.
        </div>
      ) : (
        <div className="pr-stack">
          <ErrorBoundary>
            <PaymentScheduleCard />
          </ErrorBoundary>
        </div>
      )}
    </PricingShell>
  )
}
