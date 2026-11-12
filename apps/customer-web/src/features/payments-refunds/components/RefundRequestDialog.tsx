import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { requestRefund } from '../api/mock-refunds'
import { formatAmount } from '../format'
import type { RefundReceipt, RefundRequestResult } from '../types'

interface RefundRequestDialogProps {
  receipt: RefundReceipt
  onClose: () => void
  /** Called after "View my refunds", so the page can show the new request. */
  onViewRefunds: () => void
  /** Called once a request has been sent, so the list behind the dialog can refresh. */
  onSent: () => void
}

/**
 * The "Request a refund" dialog (frames 03f and 03g), opened over the page.
 *
 * The customer picks the line, says why, and sends the request. It is always queued for staff, so the reference on the
 * "Request sent" step is the new refund's own and it shows up under "In progress".
 *
 * TODO(F5b): open this from the "Request a refund" button on a receipt, once Feature 5a's receipts are in the same
 * branch. Until then My refunds opens it for a demo receipt.
 */
export function RefundRequestDialog({ receipt, onClose, onViewRefunds, onSent }: RefundRequestDialogProps) {
  const [lineIndex, setLineIndex] = useState(0)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<RefundRequestResult | null>(null)

  const line = receipt.lines[lineIndex]

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!line) return
    if (reason.trim() === '') {
      setError('Tell us why you are asking for a refund.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      setSent(await requestRefund(receipt, { item: line.description, amount: line.amount, reason: reason.trim() }))
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="rf-overlay">
      <div role="dialog" aria-modal="true" aria-labelledby="rf-dialog-title" className="rf-dialog">
        <div className="rf-dialog-head">
          <h2 id="rf-dialog-title" className="rf-dialog-title">
            Request a refund
          </h2>
          <button type="button" className="rf-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {sent ? (
          <div className="rf-form">
            <div role="status" className="rf-success">
              <p>
                <strong>Request sent.</strong>
              </p>
              <p>
                Refund {sent.reference} for {formatAmount(sent.amount)} {sent.currency} is now awaiting review. {sent.message}
              </p>
            </div>
            <div className="rf-actions">
              <button type="button" className="rf-button rf-button--outline" onClick={onClose}>
                Done
              </button>
              <button type="button" className="rf-button" onClick={onViewRefunds}>
                View my refunds
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="rf-form">
            <div className="rf-row">
              <span>
                Receipt <strong>{receipt.document_number}</strong> · booking <strong>{receipt.booking_reference}</strong>
              </span>
            </div>

            <div className="rf-field">
              <label htmlFor="rf-item" className="rf-label">
                Item to refund
              </label>
              <select id="rf-item" className="rf-input" value={lineIndex} onChange={(event) => setLineIndex(Number(event.target.value))}>
                {receipt.lines.map((candidate, index) => (
                  <option key={candidate.description} value={index}>
                    {candidate.description} · {formatAmount(candidate.amount)}
                  </option>
                ))}
              </select>
            </div>

            <div className="rf-field">
              <label htmlFor="rf-reason" className="rf-label">
                Reason
              </label>
              <input
                id="rf-reason"
                type="text"
                className="rf-input"
                value={reason}
                maxLength={500}
                placeholder="Tell us why"
                onChange={(event) => {
                  setReason(event.target.value)
                  setError(null)
                }}
              />
            </div>

            <div className="rf-row">
              <span>Estimated return</span>
              <strong>
                {line ? formatAmount(line.amount) : '—'} {receipt.currency}
              </strong>
            </div>

            <p className="rf-note">
              Requests inside the fare rules are refunded automatically. Anything else goes to our staff, who reply within 2 working days.
            </p>

            {error && (
              <p role="alert" className="rf-problem">
                {error}
              </p>
            )}

            <div className="rf-actions">
              <button type="button" className="rf-button rf-button--outline" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="rf-button" disabled={busy || !line}>
                {busy ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
