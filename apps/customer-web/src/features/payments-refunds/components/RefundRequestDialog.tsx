import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { useRefundsApi } from '../api/refunds'
import { formatAmount } from '../format'
import type { MyRefundDto, RefundablePaymentDto } from '../types'

/** The small grey caption over a field, the way the frames set it. */
const FIELD_LABEL = 'text-xs text-muted-foreground'
/** A boxed field or row, the way the frames set them. */
const FIELD_BOX = 'rounded-lg border border-line bg-card px-3 py-2.5 text-sm text-foreground'

interface RefundRequestDialogProps {
  /** Opened from a receipt: only that booking is offered. Left out, every booking with something to refund is. */
  bookingReference?: string | null
  onClose: () => void
  /** Called after "View my refunds", so the page can show the new request. */
  onViewRefunds: () => void
  /** Called once a request has been sent, so the list behind the dialog can refresh. */
  onSent: () => void
}

/**
 * The "Request a refund" dialog (frames 03f and 03g), opened over the page.
 *
 * It asks the backend which payments of the customer's can still be refunded, and what is left on each line, so the
 * customer can only pick something real. The request is written to the `refund` table and waits in the staff queue, so
 * the reference on the "Request sent" step is the new refund's own and it shows up under "In progress".
 *
 * It is opened from "Request a refund" on My refunds, and from the same button on a receipt, which passes its booking.
 */
export function RefundRequestDialog({ bookingReference, onClose, onViewRefunds, onSent }: RefundRequestDialogProps) {
  const api = useRefundsApi()
  const [payments, setPayments] = useState<RefundablePaymentDto[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [paymentIndex, setPaymentIndex] = useState(0)
  const [lineIndex, setLineIndex] = useState(0)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<MyRefundDto | null>(null)

  const payment = payments?.[paymentIndex]
  const line = payment?.lines[lineIndex]

  useEffect(() => {
    let live = true
    api
      .listRefundable()
      .then((result) => {
        if (live) setPayments(bookingReference ? result.items.filter((item) => item.booking_reference === bookingReference) : result.items)
      })
      .catch((e: unknown) => {
        if (live) setLoadError(e instanceof Error ? e.message : 'We could not load what you can refund.')
      })
    return () => {
      live = false
    }
    // `api` is rebuilt every render, so it stays out of the list and the payments load once per booking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingReference])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!payment || !line) return
    if (reason.trim() === '') {
      setError('Tell us why you are asking for a refund.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      setSent(
        await api.requestRefund({
          booking_reference: payment.booking_reference,
          item: line.description,
          amount: line.remaining,
          reason: reason.trim(),
        }),
      )
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-ink/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="refund-dialog-title"
        className="relative my-6 w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="refund-dialog-title" className="m-0 text-xl font-bold text-foreground">
            Request a refund
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col gap-5">
            <div role="status" className="rounded-xl bg-success-soft px-4 py-3 text-success-strong">
              <p className="m-0 text-sm font-semibold">Request sent.</p>
              <p className="m-0 mt-1 text-sm">
                Refund {sent.reference} for {formatAmount(sent.amount)} {sent.currency} is now awaiting review. We email you when it is
                decided.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Done
              </Button>
              <Button type="button" onClick={onViewRefunds}>
                View my refunds
              </Button>
            </div>
          </div>
        ) : loadError ? (
          <p role="alert" className="m-0 text-sm text-danger">
            {loadError}
          </p>
        ) : !payments ? (
          <p className="m-0 py-6 text-center text-sm text-muted-foreground">Loading what you can refund…</p>
        ) : !payment || !line ? (
          <div className="flex flex-col gap-5">
            <p className="m-0 text-sm text-muted-foreground">
              {bookingReference
                ? `Nothing on ${bookingReference} can be refunded right now.`
                : 'You have no paid items that can be refunded right now.'}
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
            {payments.length > 1 ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="refund-booking" className={FIELD_LABEL}>
                  Booking
                </label>
                <select
                  id="refund-booking"
                  value={paymentIndex}
                  onChange={(event) => {
                    setPaymentIndex(Number(event.target.value))
                    setLineIndex(0)
                  }}
                  className={`${FIELD_BOX} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
                >
                  {payments.map((candidate, index) => (
                    <option key={candidate.booking_reference} value={index}>
                      {candidate.booking_reference}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className={`m-0 ${FIELD_BOX} bg-muted/50`}>
                Booking <span className="font-semibold">{payment.booking_reference}</span>
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label htmlFor="refund-item" className={FIELD_LABEL}>
                Item to refund
              </label>
              <select
                id="refund-item"
                value={lineIndex}
                onChange={(event) => setLineIndex(Number(event.target.value))}
                className={`${FIELD_BOX} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
              >
                {payment.lines.map((candidate, index) => (
                  <option key={candidate.description} value={index}>
                    {candidate.description} · {formatAmount(candidate.remaining)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="refund-reason" className={FIELD_LABEL}>
                Reason
              </label>
              <input
                id="refund-reason"
                type="text"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  setError(null)
                }}
                maxLength={500}
                placeholder="Tell us why"
                aria-invalid={error !== null && reason.trim() === ''}
                className={`${FIELD_BOX} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
              />
            </div>

            <p className={`m-0 flex items-center justify-between ${FIELD_BOX} bg-muted/50`}>
              <span>Estimated return</span>
              <span className="font-bold tabular-nums">
                {formatAmount(line.remaining)} {payment.currency}
              </span>
            </p>

            <p className="m-0 text-xs text-muted-foreground">
              Requests inside the fare rules are refunded automatically. Anything else goes to our staff, who reply within 2 working days.
            </p>

            {error && (
              <p role="alert" className="m-0 text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send request'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
