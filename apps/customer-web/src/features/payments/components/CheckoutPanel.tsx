import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ApiError, errorMessage, usePaymentsApi, type VoucherCheck } from '../api'
import { formatCountdown, formatMoney } from '../format'
import { useLoad } from '../useLoad'
import { Loading, LoadError, Notice } from './Shell'

/** One key per booking and voucher choice, kept for the tab, so a double click or a reload never pays twice. */
function idempotencyKey(bookingReference: string, voucherCode: string | null): string {
  const storageKey = `f5:checkout:${bookingReference}:${voucherCode ?? '-'}`
  try {
    const existing = sessionStorage.getItem(storageKey)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    sessionStorage.setItem(storageKey, fresh)
    return fresh
  } catch {
    return crypto.randomUUID()
  }
}

function forgetKey(bookingReference: string, voucherCode: string | null) {
  try {
    sessionStorage.removeItem(`f5:checkout:${bookingReference}:${voucherCode ?? '-'}`)
  } catch {
    // Storage unavailable: nothing was kept.
  }
}

function useSecondsLeft(expiresAt: string | undefined): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000)) : null
}

/**
 * Feature 5's part of Review & Pay: the fee summary, the voucher box and the Pay button that opens the hosted page.
 * Feature 3's Review & Pay (and 17's cargo page) mount this; the itinerary itself belongs to them.
 */
export function CheckoutPanel({ bookingReference }: { bookingReference: string }) {
  const api = usePaymentsApi()
  const navigate = useNavigate()
  const [appliedCode, setAppliedCode] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [checked, setChecked] = useState<VoucherCheck | null>(null)
  const [voucherError, setVoucherError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const preview = useLoad(() => api.previewCheckout(bookingReference, appliedCode ?? undefined), `${bookingReference}:${appliedCode ?? ''}`)
  const secondsLeft = useSecondsLeft(preview.data?.expires_at)

  async function checkVoucher() {
    setVoucherError(null)
    setChecked(null)
    try {
      setChecked(await api.validateVoucher(codeInput, bookingReference))
    } catch (error) {
      setVoucherError(errorMessage(error))
    }
  }

  async function pay() {
    setPaying(true)
    setPayError(null)
    try {
      const live = preview.data?.live_payment
      const result =
        live?.status === 'created'
          ? await api.newAttempt(live.id)
          : await api.checkout(bookingReference, idempotencyKey(bookingReference, appliedCode), appliedCode ?? undefined)
      if (result.checkout_url) {
        window.location.assign(result.checkout_url)
        return
      }
      await navigate({ to: '/payments/$paymentId', params: { paymentId: result.payment.id } })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'HOLD_TOO_SHORT') forgetKey(bookingReference, appliedCode)
      setPayError(errorMessage(error))
      setPaying(false)
    }
  }

  if (preview.loading && !preview.data) return <Loading label="Loading your booking…" />
  if (preview.error && !preview.data) return <LoadError message={preview.error} onRetry={preview.reload} />
  const data = preview.data
  if (!data) return null

  const live = data.live_payment
  if (live && live.status !== 'created') {
    return (
      <div className="pay-card pay-state">
        <p>This booking already has a payment.</p>
        <Link className="pay-btn" to="/payments/$paymentId" params={{ paymentId: live.id }}>
          See payment status
        </Link>
      </div>
    )
  }

  if (!data.payable || secondsLeft === 0) {
    return (
      <div className="pay-card pay-state">
        <div className="pay-state-icon" data-tone="bad" aria-hidden="true">
          !
        </div>
        <h2>Your hold has ended</h2>
        <p className="pay-muted">The seats are no longer reserved for you. Search again to book.</p>
        <div className="pay-actions">
          <Link className="pay-btn" to="/">
            Back to search
          </Link>
        </div>
      </div>
    )
  }

  const zeroCash = Number(data.amount_total) === 0
  const cardDue = Number(data.card_amount)

  return (
    <>
      <div className="pay-card">
        <div className="pay-row">
          <h2>Booking {data.label}</h2>
          {secondsLeft !== null && (
            <span className="pay-chip" data-tone={secondsLeft < 180 ? 'bad' : 'warn'} aria-live="polite">
              Held for {formatCountdown(secondsLeft)}
            </span>
          )}
        </div>
        {data.lines.map((line, i) => (
          <div className="pay-row" key={i}>
            <span>{line.description}</span>
            <span>{formatMoney(line.amount, data.currency)}</span>
          </div>
        ))}
        {data.miles_booking && (
          <p className="pay-muted">Miles for these seats are held by your loyalty account; only the cash part is paid here.</p>
        )}
        <div className="pay-row pay-row--total">
          <span>Total</span>
          <span>{formatMoney(data.amount_total, data.currency)}</span>
        </div>
        {Number(data.voucher_amount) > 0 && (
          <>
            <div className="pay-row">
              <span>Voucher {appliedCode}</span>
              <span>−{formatMoney(data.voucher_amount, data.currency)}</span>
            </div>
            <div className="pay-row pay-row--total">
              <span>To pay by card</span>
              <span>{formatMoney(data.card_amount, data.currency)}</span>
            </div>
          </>
        )}
      </div>

      {!zeroCash && (
        <div className="pay-card">
          <h2>Compensation voucher</h2>
          {appliedCode ? (
            <div className="pay-row">
              <span>
                <span className="pay-code">{appliedCode}</span> applied
              </span>
              <button
                type="button"
                className="pay-btn pay-btn--ghost"
                onClick={() => {
                  setAppliedCode(null)
                  setChecked(null)
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <label className="pay-label" htmlFor="voucher-code">
                Voucher code
              </label>
              <div className="pay-field">
                <input
                  id="voucher-code"
                  className="pay-input"
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value.toUpperCase())
                    setChecked(null)
                  }}
                  placeholder="e.g. 7KQ2MXP4RT"
                  autoComplete="off"
                  maxLength={14}
                />
                <button
                  type="button"
                  className="pay-btn pay-btn--ghost"
                  disabled={codeInput.trim().length < 10}
                  onClick={() => void checkVoucher()}
                >
                  Check
                </button>
              </div>
              {voucherError && <Notice tone="bad">{voucherError}</Notice>}
              {checked && (
                <>
                  <Notice tone={Number(checked.forfeited_amount) > 0 ? 'warn' : 'good'}>
                    Worth {formatMoney(checked.amount, checked.currency)}. It pays {formatMoney(checked.applied_amount, checked.currency)}{' '}
                    of this booking.
                    {Number(checked.forfeited_amount) > 0 &&
                      ` A voucher is used whole: the remaining ${formatMoney(checked.forfeited_amount, checked.currency)} will be lost.`}
                  </Notice>
                  <button type="button" className="pay-btn" onClick={() => setAppliedCode(checked.code)}>
                    Apply voucher
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {payError && <Notice tone="bad">{payError}</Notice>}
      <button type="button" className="pay-btn pay-btn--block" disabled={paying} onClick={() => void pay()}>
        {paying
          ? 'Opening payment…'
          : zeroCash
            ? 'Confirm with miles'
            : cardDue === 0
              ? 'Pay with voucher'
              : `Pay ${formatMoney(data.card_amount, data.currency)} with card`}
      </button>
      {cardDue > 0 && (
        <p className="pay-muted">You will pay on our payment partner's secure page. Cards, Apple Pay and Google Pay are accepted.</p>
      )}
    </>
  )
}
