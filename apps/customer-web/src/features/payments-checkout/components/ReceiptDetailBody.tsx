import { useState } from 'react'
import { Button } from '@customer-web/components/ui/button'
import {
  AIRPORT_CITIES,
  CARGO_REFUND_NOTE,
  DOCUMENT_LABELS,
  formatAmount,
  formatDateTime,
  formatFlightDate,
  MILES_REFUND_NOTE,
  REFUND_STATE_COPY,
  tripNote,
} from '../receipt-copy'
import { ReceiptStateBadge, ReceiptStatusBadge } from './ReceiptStatusBadge'
import type { ReceiptDetailDto } from '../types'

/** A labelled value, the way the frames set them: a grey name over a dark value. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
      <span className="text-base text-foreground">{value}</span>
    </div>
  )
}

/** The two airports of a trip, with their cities. `YGN → BKK` becomes the two ends of the route line. */
function ends(receipt: ReceiptDetailDto): { from: string; to: string } {
  const [from = '', to = ''] = (receipt.route ?? '').split('→').map((part) => part.trim())
  return { from, to }
}

/**
 * The cargo's waybill, the way the cargo panel writes it.
 *
 * The list adds the flight and the weight to the same line — `Cargo · AWB 217-48201936 · FY214 · 180 kg` — but the panel
 * names the waybill alone.
 */
function cargoWaybill(title: string): string {
  return title.split(' · ').slice(0, 2).join(' · ')
}

/**
 * The note the frame puts above the buttons: what this receipt says about a refund.
 *
 * The frames say something different for each kind of receipt — what happens to the miles, what happens to a flight
 * that has flown, who handles a cargo refund — so the note is picked from the receipt itself.
 */
function refundNote(receipt: ReceiptDetailDto): string {
  if (receipt.miles_redeemed !== null) return MILES_REFUND_NOTE
  if (receipt.source_feature === 17) return CARGO_REFUND_NOTE
  return REFUND_STATE_COPY[receipt.refund_state].note
}

/** Downloads the receipt as a text file, the way the frame's "Download receipt" button does. */
function downloadReceipt(receipt: ReceiptDetailDto): void {
  const lines = [
    `Flython Airlines — ${DOCUMENT_LABELS[receipt.document_type]}`,
    receipt.document_number,
    '',
    ...receipt.lines.map((line) => `${line.description} — ${formatAmount(line.amount)} ${receipt.currency}`),
    `Total charged — ${formatAmount(receipt.amount)} ${receipt.currency}`,
    `Paid with — ${receipt.paid_with}`,
    receipt.booking_reference ? `Booking — ${receipt.booking_reference}` : '',
    receipt.credit_note ? `Credit note — ${receipt.credit_note.document_number}` : '',
  ].filter(Boolean)
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${receipt.document_number}.txt`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * One receipt, in full.
 *
 * This is the frames' receipt panel: the document number and its state, the trip with the two airport codes, what the
 * money paid for, the total, and the credit note if the payment was reversed.
 */
export function ReceiptDetailBody({ receipt }: { receipt: ReceiptDetailDto }) {
  const [showCreditNote, setShowCreditNote] = useState(false)
  const refund = REFUND_STATE_COPY[receipt.refund_state]
  const { from, to } = ends(receipt)
  /* A flight that has already gone is written without its weekday, the way the frames write it. */
  const flown = receipt.receipt_status === 'flown'
  const note = tripNote(receipt)

  return (
    <div className="flex flex-col gap-5">
      {/* The document ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 pr-14">
        <span className="rounded-md bg-navy/10 px-2 py-1 font-mono text-sm font-medium text-navy">{receipt.document_number}</span>
        <ReceiptStateBadge status={receipt.receipt_status} />
        {/* The receipt state never changes, so a refunded payment says so separately. */}
        {receipt.status !== 'captured' && <ReceiptStatusBadge status={receipt.status} />}
        {/* A fare that cannot be refunded says so on the document row — the other states are said in the note. */}
        {receipt.refund_state === 'not_refundable' && (
          <span className="rounded-md bg-warning-soft px-2 py-1 text-xs font-semibold text-warning">{refund.label}</span>
        )}
        {receipt.flight_date && <span className="text-sm text-muted-foreground">{formatFlightDate(receipt.flight_date, flown)}</span>}
      </div>

      {/* The trip --------------------------------------------------------- */}
      {receipt.route ? (
        <>
          {/* A flight names its flight, a cargo names its waybill. */}
          {receipt.source_feature === 17 ? (
            <p className="m-0 text-base font-semibold text-foreground">{cargoWaybill(receipt.title)}</p>
          ) : (
            receipt.flight_number && (
              <p className="m-0 text-sm text-muted-foreground">
                Flight {receipt.flight_number}
                {note && ` · ${note}`}
              </p>
            )
          )}
          <div className="flex items-end justify-between gap-6">
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-foreground">{from}</span>
              <span className="text-sm text-muted-foreground">{AIRPORT_CITIES[from] ?? from}</span>
            </div>
            <div className="flex-1 pb-2">
              {receipt.flight_date && (
                <p className="m-0 text-center text-sm text-muted-foreground">{formatFlightDate(receipt.flight_date, flown)}</p>
              )}
              <div className="mt-2 h-px bg-border" />
            </div>
            <div className="flex flex-col text-right">
              <span className="text-3xl font-bold text-foreground">{to}</span>
              <span className="text-sm text-muted-foreground">{AIRPORT_CITIES[to] ?? to}</span>
            </div>
          </div>
          <div className="border-t border-dashed border-border" />
        </>
      ) : (
        <>
          <p className="m-0 text-sm text-muted-foreground">{receipt.source_feature_label}</p>
          <div className="border-t border-dashed border-border" />
        </>
      )}

      {/* The booking and what was paid with ------------------------------ */}
      <div className="grid grid-cols-2 gap-4 max-phone:grid-cols-1">
        <Detail label="Booking" value={receipt.booking_reference ?? '—'} />
        <Detail label="Paid with" value={receipt.paid_with} />
      </div>

      {/* What the money paid for ----------------------------------------- */}
      <div>
        <h3 className="m-0 text-xs font-semibold tracking-wider text-muted-foreground uppercase">What you paid for</h3>
        <ul className="m-0 mt-3 list-none p-0">
          {receipt.lines.map((line, index) => (
            <li
              key={`${line.line_type}-${index}`}
              className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0"
            >
              <span className="text-base text-foreground">{line.description}</span>
              <span className="shrink-0 text-base text-foreground tabular-nums">{formatAmount(line.amount)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* The total ------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-base font-bold text-foreground">Total charged</span>
        <span className="text-lg font-bold text-foreground tabular-nums">
          {formatAmount(receipt.amount)} {receipt.currency}
        </span>
      </div>

      {/* The note above the buttons --------------------------------------- */}
      <p className="m-0 text-sm text-muted-foreground">{refundNote(receipt)}</p>

      {/* The credit note ------------------------------------------------- */}
      {receipt.credit_note && (
        <>
          <p className="m-0 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
            Credit note {receipt.credit_note.document_number}: refund, −{formatAmount(receipt.credit_note.amount)} {receipt.currency}
          </p>
          {showCreditNote && (
            <dl className="m-0 grid grid-cols-3 gap-4 rounded-xl border border-line bg-card px-4 py-3 max-phone:grid-cols-1">
              <Detail label="Credit note" value={receipt.credit_note.document_number} />
              <Detail label="Issued" value={formatDateTime(receipt.credit_note.issued_at)} />
              <Detail label="Refunded" value={`−${formatAmount(receipt.credit_note.amount)} ${receipt.currency}`} />
            </dl>
          )}
        </>
      )}

      {/* The actions ----------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => downloadReceipt(receipt)}>
          Download receipt
        </Button>
        {/* Refunds are Feature 5b. The frame shows the button; this release cannot take the request yet. */}
        {refund.action && (
          <Button type="button" variant="outline" disabled title="Coming with feature 5b">
            {refund.action}
          </Button>
        )}
        {receipt.credit_note && (
          <Button type="button" variant="outline" onClick={() => setShowCreditNote((shown) => !shown)}>
            View credit note
          </Button>
        )}
      </div>
    </div>
  )
}
