import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { errorMessage, usePaymentsApi, type Payment } from '../api'
import { formatMoney } from '../format'
import { useLoad } from '../useLoad'
import { CheckoutShell, Loading, LoadError, Notice } from '../components/Shell'
import type { Tone } from '../format'

const POLL_MS = 2000
const POLL_LIMIT = 45 // about 90 seconds, then the page asks the customer to check back

type View =
  | { kind: 'processing' }
  | { kind: 'paid' }
  | { kind: 'paid_miles' }
  | { kind: 'cargo_paid' }
  | { kind: 'stalled' }
  | { kind: 'failed' }
  | { kind: 'voided' }
  | { kind: 'expired' }
  | { kind: 'refunded' }

/** Which state the page shows. Only the payment status decides; the redirect back from the hosted page proves nothing. */
function viewFor(payment: Payment): View {
  switch (payment.status) {
    case 'created':
      return { kind: 'processing' }
    case 'authorised':
      return payment.capture_stalled_at ? { kind: 'stalled' } : { kind: 'processing' }
    case 'captured':
      if (payment.source_feature === 17) return { kind: 'cargo_paid' }
      return Number(payment.card_amount) === 0 && payment.miles_used ? { kind: 'paid_miles' } : { kind: 'paid' }
    case 'reversed':
      return { kind: 'refunded' }
    case 'failed':
      return { kind: 'failed' }
    case 'voided':
      return { kind: 'voided' }
    case 'expired':
      return { kind: 'expired' }
    default: {
      const unknown: never = payment.status
      return unknown
    }
  }
}

function StateHeader({ tone, icon, title, children }: { tone: Tone; icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="pay-state">
      <div className="pay-state-icon" data-tone={tone} aria-hidden="true">
        {icon}
      </div>
      <h1 className="pay-h1">{title}</h1>
      {children}
    </div>
  )
}

/**
 * Payment Return: the selling feature's confirmation page shows this. Polls GET /payments/:id until a webhook has
 * moved the status, then shows processing, paid, paid with miles, cargo paid, capture stalled, failed, voided or expired.
 */
export function PaymentReturnPage({ paymentId, declined }: { paymentId: string; declined?: boolean }) {
  const api = usePaymentsApi()
  const [polls, setPolls] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const payment = useLoad(() => api.getPayment(paymentId), paymentId)
  const view = payment.data ? viewFor(payment.data) : null
  const stillMoving = view?.kind === 'processing' && polls < POLL_LIMIT

  const { reload } = payment
  useEffect(() => {
    if (!stillMoving || payment.loading) return
    const timer = setTimeout(() => {
      setPolls((n) => n + 1)
      reload()
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [stillMoving, payment.loading, polls, reload])

  async function tryAgain() {
    setRetrying(true)
    setRetryError(null)
    try {
      const result = await api.newAttempt(paymentId)
      if (result.checkout_url) window.location.assign(result.checkout_url)
      else payment.reload()
    } catch (error) {
      setRetryError(errorMessage(error))
    } finally {
      setRetrying(false)
    }
  }

  if (!payment.data) {
    return (
      <CheckoutShell>
        {payment.error ? <LoadError message={payment.error} onRetry={payment.reload} /> : <Loading label="Checking your payment…" />}
      </CheckoutShell>
    )
  }

  const p = payment.data
  const total = formatMoney(p.amount_total, p.currency)
  const reference = p.booking_reference ?? p.cargo_booking_ref ?? ''
  const receiptLink = p.receipt && (
    <Link className="pay-btn pay-btn--ghost" to="/account/receipts/$paymentId" params={{ paymentId: p.id }}>
      View receipt
    </Link>
  )

  let body: React.ReactNode
  switch (view?.kind) {
    case 'processing':
      body = (
        <div className="pay-state" role="status" aria-live="polite">
          <div className="pay-spinner" aria-hidden="true" />
          <h1 className="pay-h1">Confirming your payment</h1>
          <p className="pay-muted">
            {stillMoving
              ? "We're waiting for the bank to confirm. This usually takes a few seconds — please don't pay again."
              : 'This is taking longer than usual. Your card will not be charged twice; check back in a few minutes.'}
          </p>
          {p.status === 'created' && declined && (
            <Notice tone="bad">Your card was declined. You can try another card on the payment page.</Notice>
          )}
          {p.status === 'created' && (
            <div className="pay-actions">
              <button type="button" className="pay-btn pay-btn--ghost" disabled={retrying} onClick={() => void tryAgain()}>
                Return to payment page
              </button>
            </div>
          )}
        </div>
      )
      break
    case 'paid':
      body = (
        <StateHeader tone="good" icon="✓" title="Payment received">
          <p>
            {total} paid{p.card_last4 && ` with ${p.card_brand ?? 'card'} ending ${p.card_last4}`}
            {Number(p.voucher_amount) > 0 && `, including a ${formatMoney(p.voucher_amount, p.currency)} voucher`}.
          </p>
          <p className="pay-muted">Booking {reference} is confirmed. We've sent the receipt to your email.</p>
          <div className="pay-actions">
            <Link className="pay-btn" to="/dashboard">
              Go to my booking
            </Link>
            {receiptLink}
          </div>
        </StateHeader>
      )
      break
    case 'paid_miles':
      body = (
        <StateHeader tone="good" icon="✓" title="Booked with miles">
          <p>Paid with {p.miles_used?.toLocaleString('en-US')} miles. Nothing was charged to a card.</p>
          <p className="pay-muted">Booking {reference} is confirmed.</p>
          <div className="pay-actions">
            <Link className="pay-btn" to="/dashboard">
              Go to my booking
            </Link>
            {receiptLink}
          </div>
        </StateHeader>
      )
      break
    case 'cargo_paid':
      body = (
        <StateHeader tone="good" icon="✓" title="Shipment paid">
          <p>
            {total} paid for cargo booking {reference}.
          </p>
          <p>
            {p.awb_number ? (
              <>
                Air Waybill <strong className="pay-code">{p.awb_number}</strong>
              </>
            ) : (
              'Your Air Waybill number is being issued.'
            )}
          </p>
          <div className="pay-actions">{receiptLink}</div>
        </StateHeader>
      )
      break
    case 'stalled':
      body = (
        <StateHeader tone="warn" icon="…" title="Booking confirmed, payment still processing">
          <p>
            Your booking {reference} is confirmed. We couldn't complete the charge yet and will keep retrying — you don't need to do
            anything.
          </p>
          <p className="pay-muted">You will only be charged {total} once.</p>
        </StateHeader>
      )
      break
    case 'failed':
      body = (
        <StateHeader tone="bad" icon="!" title="Payment didn't go through">
          <p className="pay-muted">Nothing was charged. If your seats are still held you can start again.</p>
          <div className="pay-actions">
            {p.booking_reference && (
              <Link className="pay-btn" to="/checkout/$bookingRef" params={{ bookingRef: p.booking_reference }}>
                Try again
              </Link>
            )}
          </div>
        </StateHeader>
      )
      break
    case 'voided':
      body = (
        <StateHeader tone="bad" icon="!" title="We couldn't confirm your booking">
          <p>{voidReason(p.last_error)}</p>
          <p className="pay-muted">The amount held on your card has been released — you have not been charged.</p>
          <div className="pay-actions">
            <Link className="pay-btn" to="/">
              Back to search
            </Link>
          </div>
        </StateHeader>
      )
      break
    case 'expired':
      body = (
        <StateHeader tone="bad" icon="!" title="Your hold ended before payment">
          <p className="pay-muted">Nothing was charged. Search again to book.</p>
          <div className="pay-actions">
            <Link className="pay-btn" to="/">
              Back to search
            </Link>
          </div>
        </StateHeader>
      )
      break
    case 'refunded':
      body = (
        <StateHeader tone="good" icon="↺" title="This payment was refunded">
          <div className="pay-actions">
            <Link className="pay-btn" to="/account/refunds">
              See my refunds
            </Link>
          </div>
        </StateHeader>
      )
      break
    default:
      body = null
  }

  return (
    <CheckoutShell>
      <div className="pay-card">
        {body}
        {retryError && <Notice tone="bad">{retryError}</Notice>}
      </div>
    </CheckoutShell>
  )
}

function voidReason(lastError: string | null): string {
  if (lastError?.startsWith('SEAT_UNAVAILABLE')) return 'One of your seats was taken before we could confirm it.'
  if (lastError?.startsWith('HOLD_EXPIRED')) return 'Your hold ended before the payment was confirmed.'
  if (lastError?.startsWith('FLIGHT_NOT_FOR_SALE')) return 'This flight is no longer for sale.'
  if (lastError?.startsWith('REDEMPTION_LAPSED')) return 'Your miles redemption lapsed; the miles are back in your account.'
  return 'The booking could not be confirmed.'
}
