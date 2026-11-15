import { useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { errorMessage, usePaymentsApi } from '../api'
import { formatDate, formatDateTime, formatMoney, lineTypeLabel, refundReasonLabel, refundStatusLabel } from '../format'
import { useLoad } from '../useLoad'
import { AccountShell, Chip, Empty, Loading, LoadError, Notice } from '../components/Shell'

const TIMING_NOTE =
  'A refund to a card usually takes 5 to 10 business days. A refund shortly after paying may instead show as the charge disappearing from your statement.'

/** My refunds: the list with status and amounts, and a request form for a refund outside a cancel. */
export function RefundsPage({ requestFor }: { requestFor?: string }) {
  const api = usePaymentsApi()
  const refunds = useLoad(() => api.myRefunds(), 'mine')

  return (
    <AccountShell title="My refunds" subtitle={TIMING_NOTE}>
      {requestFor && <RefundRequestForm paymentId={requestFor} onSent={refunds.reload} />}
      {refunds.loading && !refunds.data && <Loading />}
      {refunds.error && <LoadError message={refunds.error} onRetry={refunds.reload} />}
      {refunds.data?.length === 0 && <Empty>No refunds yet. To ask for one, open a receipt and choose “Request a refund”.</Empty>}
      {refunds.data && refunds.data.length > 0 && (
        <div className="pay-card">
          <ul className="pay-list">
            {refunds.data.map((r) => {
              const status = refundStatusLabel(r.status)
              return (
                <li key={r.id}>
                  <Link to="/account/refunds/$refundId" params={{ refundId: r.id }}>
                    <span className="pay-item-main">
                      <span className="pay-item-title">{refundReasonLabel(r.reason)}</span>
                      <span className="pay-muted">
                        {r.payment.booking?.booking_reference ? `Booking ${r.payment.booking.booking_reference} · ` : ''}
                        {formatDate(r.requested_at)}
                      </span>
                    </span>
                    <span className="pay-item-side">
                      <span>{formatMoney(r.amount, r.payment.currency)}</span>
                      <Chip tone={status.tone}>{status.label}</Chip>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </AccountShell>
  )
}

function RefundRequestForm({ paymentId, onSent }: { paymentId: string; onSent: () => void }) {
  const api = usePaymentsApi()
  const payment = useLoad(() => api.getPayment(paymentId), paymentId)
  const [lineId, setLineId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (note.trim().length < 3) {
      setError('Tell us briefly why you are asking for a refund.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.requestRefund(paymentId, note.trim(), lineId || undefined)
      setSent(true)
      onSent()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (payment.error) return <LoadError message={payment.error} onRetry={payment.reload} />
  if (!payment.data) return <Loading />
  const p = payment.data
  const refundable = p.lines.filter((l) => Number(l.amount) > Number(l.refunded_amount))

  if (sent) return <Notice tone="good">Your request was sent. Our team will review it and you'll see the decision here.</Notice>

  return (
    <form className="pay-card" onSubmit={(e) => void submit(e)} noValidate>
      <h2>Request a refund{p.booking_reference && ` for booking ${p.booking_reference}`}</h2>
      {refundable.length === 0 ? (
        <Notice>Everything on this payment has already been refunded.</Notice>
      ) : (
        <>
          <label className="pay-label" htmlFor="refund-line">
            What is the refund for?
          </label>
          <select id="refund-line" className="pay-select" value={lineId} onChange={(e) => setLineId(e.target.value)}>
            <option value="">The whole payment</option>
            {refundable.map((l) => (
              <option key={l.id} value={l.id}>
                {lineTypeLabel(l.line_type)}: {l.description} ({formatMoney(Number(l.amount) - Number(l.refunded_amount), p.currency)})
              </option>
            ))}
          </select>
          <label className="pay-label" htmlFor="refund-note">
            Reason
          </label>
          <textarea
            id="refund-note"
            className="pay-textarea"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={Boolean(error)}
          />
          <p className="pay-muted">To cancel a booking, use Manage booking instead; the cancellation refund is worked out for you.</p>
          {error && <Notice tone="bad">{error}</Notice>}
          <button type="submit" className="pay-btn" disabled={busy}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
        </>
      )}
    </form>
  )
}

export function RefundDetailPage({ refundId }: { refundId: string }) {
  const api = usePaymentsApi()
  const refund = useLoad(() => api.getRefund(refundId), refundId)

  if (!refund.data) {
    return (
      <AccountShell title="Refund">
        {refund.error ? <LoadError message={refund.error} onRetry={refund.reload} /> : <Loading />}
      </AccountShell>
    )
  }
  const r = refund.data
  const currency = r.payment.currency
  const status = refundStatusLabel(r.status)
  const toVoucher = Number(r.voucher_amount)
  const toCard = Number(r.amount) - toVoucher

  return (
    <AccountShell title={refundReasonLabel(r.reason)} subtitle={TIMING_NOTE}>
      <div className="pay-card">
        <div className="pay-row">
          <span className="pay-muted">Requested {formatDateTime(r.requested_at)}</span>
          <Chip tone={status.tone}>{status.label}</Chip>
        </div>
        {r.refund_line?.map((l) => (
          <div className="pay-row" key={l.id}>
            <span>
              {l.payment_line.description}
              <span className="pay-muted"> · {lineTypeLabel(l.payment_line.line_type)}</span>
            </span>
            <span>{formatMoney(l.amount, currency)}</span>
          </div>
        ))}
        {Number(r.fee_withheld) > 0 && (
          <div className="pay-row">
            <span>Cancellation fee kept</span>
            <span>{formatMoney(r.fee_withheld, currency)}</span>
          </div>
        )}
        <div className="pay-row pay-row--total">
          <span>Refund</span>
          <span>{formatMoney(r.amount, currency)}</span>
        </div>
        {toCard > 0 && (
          <div className="pay-row">
            <span>To your card</span>
            <span>{formatMoney(toCard, currency)}</span>
          </div>
        )}
        {toVoucher > 0 && (
          <div className="pay-row">
            <span>As a new voucher{r.compensation_voucher && <span className="pay-code"> {r.compensation_voucher.code}</span>}</span>
            <span>{formatMoney(toVoucher, currency)}</span>
          </div>
        )}
        {r.receipt && <p className="pay-muted">Credit note {r.receipt.document_number}</p>}
        {r.status === 'rejected' && r.decision_note && <Notice tone="bad">Declined: {r.decision_note}</Notice>}
        {r.status === 'failed' && (
          <Notice tone="bad">This refund could not be completed. Our team will contact you about another way to pay it.</Notice>
        )}
      </div>
      <Link className="pay-btn pay-btn--ghost" to="/account/refunds">
        All refunds
      </Link>
    </AccountShell>
  )
}
