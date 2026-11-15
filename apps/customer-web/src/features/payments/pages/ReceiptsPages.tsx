import { Link } from '@tanstack/react-router'
import { usePaymentsApi } from '../api'
import { formatDate, formatDateTime, formatMoney, lineTypeLabel, paymentStatusLabel } from '../format'
import { useLoad } from '../useLoad'
import { AccountShell, Chip, Empty, Loading, LoadError } from '../components/Shell'

/** Receipts: every payment with its status chip; cargo shows the Air Waybill, miles bookings "Paid with N miles". */
export function ReceiptsPage() {
  const api = usePaymentsApi()
  const payments = useLoad(() => api.myPayments(), 'mine')

  return (
    <AccountShell title="Receipts" subtitle="Your payments, receipts and invoices.">
      {payments.loading && !payments.data && <Loading />}
      {payments.error && <LoadError message={payments.error} onRetry={payments.reload} />}
      {payments.data?.length === 0 && <Empty>You have no payments yet.</Empty>}
      {payments.data && payments.data.length > 0 && (
        <div className="pay-card">
          <ul className="pay-list">
            {payments.data.map((p) => {
              const status = paymentStatusLabel(p.status)
              const title = p.booking_reference
                ? `Booking ${p.booking_reference}`
                : p.cargo_booking_ref
                  ? `Cargo ${p.cargo_booking_ref}`
                  : 'Purchase'
              return (
                <li key={p.id}>
                  <Link to="/account/receipts/$paymentId" params={{ paymentId: p.id }}>
                    <span className="pay-item-main">
                      <span className="pay-item-title">{title}</span>
                      <span className="pay-muted">
                        {formatDate(p.captured_at ?? p.started_at)}
                        {p.awb_number && ` · AWB ${p.awb_number}`}
                        {p.miles_used ? ` · Paid with ${p.miles_used.toLocaleString('en-US')} miles` : ''}
                      </span>
                    </span>
                    <span className="pay-item-side">
                      <span>{formatMoney(p.amount_total, p.currency)}</span>
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

/** One receipt or invoice: lines, voucher used, card brand and last four, credit notes, and a print view. */
export function ReceiptDetailPage({ paymentId }: { paymentId: string }) {
  const api = usePaymentsApi()
  const payment = useLoad(() => api.getPayment(paymentId), paymentId)
  const hasReceipt = Boolean(payment.data?.receipt)
  const receipt = useLoad(() => (hasReceipt ? api.getReceipt(paymentId) : Promise.resolve(null)), `${paymentId}:${hasReceipt}`)

  if (!payment.data) {
    return (
      <AccountShell title="Receipt">
        {payment.error ? <LoadError message={payment.error} onRetry={payment.reload} /> : <Loading />}
      </AccountShell>
    )
  }
  const p = payment.data
  const doc = receipt.data
  const status = paymentStatusLabel(p.status)
  const title = doc ? `${doc.document_type === 'invoice' ? 'Invoice' : 'Receipt'} ${doc.document_number}` : 'Payment'

  return (
    <AccountShell title={title}>
      <div className="pay-card">
        <div className="pay-row">
          <span className="pay-muted">
            {p.booking_reference ? `Booking ${p.booking_reference}` : p.cargo_booking_ref ? `Cargo ${p.cargo_booking_ref}` : p.purchase_ref}
            {doc && ` · issued ${formatDateTime(doc.issued_at)}`}
          </span>
          <Chip tone={status.tone}>{status.label}</Chip>
        </div>
        {doc?.billing_name && <p>Billed to {doc.billing_name}</p>}
        {p.awb_number && (
          <p>
            Air Waybill <strong className="pay-code">{p.awb_number}</strong>
          </p>
        )}
        {!doc && <p className="pay-muted">A receipt is issued once the payment is complete.</p>}

        {p.lines.map((line) => (
          <div className="pay-row" key={line.id}>
            <span>
              {line.description}
              <span className="pay-muted"> · {lineTypeLabel(line.line_type)}</span>
            </span>
            <span>{formatMoney(line.amount, p.currency)}</span>
          </div>
        ))}
        {p.miles_used ? (
          <div className="pay-row">
            <span>Paid with miles</span>
            <span>{p.miles_used.toLocaleString('en-US')} miles</span>
          </div>
        ) : null}
        <div className="pay-row pay-row--total">
          <span>Total</span>
          <span>{formatMoney(p.amount_total, p.currency)}</span>
        </div>
        {Number(p.voucher_amount) > 0 && (
          <div className="pay-row">
            <span>Voucher {p.voucher_code}</span>
            <span>−{formatMoney(p.voucher_amount, p.currency)}</span>
          </div>
        )}
        {Number(p.card_amount) > 0 && (
          <div className="pay-row">
            <span>{p.card_last4 ? `${p.card_brand ?? 'Card'} ending ${p.card_last4}` : 'Card'}</span>
            <span>{formatMoney(p.card_amount, p.currency)}</span>
          </div>
        )}
      </div>

      {doc && doc.credit_notes.length > 0 && (
        <div className="pay-card">
          <h2>Credit notes</h2>
          {doc.credit_notes.map((note) => (
            <div className="pay-row" key={note.document_number}>
              <span>
                <Link to="/account/refunds/$refundId" params={{ refundId: note.refund_id }}>
                  {note.document_number}
                </Link>
                <span className="pay-muted"> · {formatDate(note.issued_at)}</span>
              </span>
              <span>−{formatMoney(note.amount, p.currency)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="pay-noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {doc && (
          <button type="button" className="pay-btn" onClick={() => window.print()}>
            Print
          </button>
        )}
        {(p.status === 'captured' || p.status === 'reversed') && (
          <Link className="pay-btn pay-btn--ghost" to="/account/refunds" search={{ request: p.id }}>
            Request a refund
          </Link>
        )}
        <Link className="pay-btn pay-btn--ghost" to="/account/receipts">
          All receipts
        </Link>
      </div>
    </AccountShell>
  )
}
