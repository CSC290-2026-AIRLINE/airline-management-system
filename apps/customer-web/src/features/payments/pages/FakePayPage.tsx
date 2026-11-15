import { useState } from 'react'
import { errorMessage, usePaymentsApi, type FakeOutcome } from '../api'
import { formatMoney } from '../format'
import { useLoad } from '../useLoad'
import { CheckoutShell, Loading, LoadError, Notice } from '../components/Shell'

const OUTCOMES: { outcome: FakeOutcome; label: string; hint: string }[] = [
  { outcome: 'success', label: 'Pay (test card 4242)', hint: 'Authorises at once, then confirm and capture' },
  { outcome: 'slow', label: 'Pay, webhook arrives late', hint: 'The return page shows processing for a few seconds' },
  { outcome: 'decline', label: 'Card declined', hint: 'Stays on this page so you can try again' },
  { outcome: 'capture_fails', label: 'Pay, capture keeps failing', hint: 'Booking confirmed, capture stalls after the retry limit' },
  { outcome: 'cancel', label: 'Cancel and go back', hint: 'Returns to Review & Pay' },
]

/**
 * The development stand-in for Stripe's hosted page (PAYMENT_PROVIDER=fake). With Stripe the customer never sees this
 * page. It only raises the events Stripe would send; the payment itself moves on the backend.
 */
export function FakePayPage({ sessionId, declined }: { sessionId: string; declined?: boolean }) {
  const api = usePaymentsApi()
  const session = useLoad(() => api.fakeSession(sessionId), sessionId)
  const [busy, setBusy] = useState<FakeOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(outcome: FakeOutcome) {
    setBusy(outcome)
    setError(null)
    try {
      const { redirect } = await api.completeFakeSession(sessionId, outcome)
      window.location.assign(redirect)
    } catch (e) {
      setError(errorMessage(e))
      setBusy(null)
    }
  }

  return (
    <CheckoutShell>
      {session.loading && !session.data && <Loading />}
      {session.error && !session.data && <LoadError message={session.error} onRetry={session.reload} />}
      {session.data && (
        <div className="pay-card">
          <p className="pay-muted">Test payment page · development only</p>
          <h1 className="pay-h1">{formatMoney(session.data.amount_cents / 100, session.data.currency)}</h1>
          <p className="pay-sub">{session.data.description}</p>
          {declined && <Notice tone="bad">Your card was declined. Try again.</Notice>}
          {session.data.state !== 'open' ? (
            <Notice tone="warn">This payment page is {session.data.state}.</Notice>
          ) : (
            <div className="pay-demo">
              <strong>Choose what the card does</strong>
              <div className="pay-demo-options">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.outcome}
                    type="button"
                    className={o.outcome === 'success' ? 'pay-btn pay-btn--block' : 'pay-btn pay-btn--ghost pay-btn--block'}
                    disabled={busy !== null}
                    title={o.hint}
                    onClick={() => void choose(o.outcome)}
                  >
                    {busy === o.outcome ? 'Working…' : o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <Notice tone="bad">{error}</Notice>}
        </div>
      )}
    </CheckoutShell>
  )
}
