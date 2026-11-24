import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Separator } from '@customer-web/components/ui/separator'
import { Table, TableBody, TableCell, TableRow } from '@customer-web/components/ui/table'
import { RefundRequestDialog } from '@customer-web/features/payments-refunds/components/RefundRequestDialog'
import {
  AIRPORT_CITIES,
  CARGO_REFUND_ACTION,
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

/** A labelled value: a muted name over the value. */
function Detail({ label, value, align = 'start' }: { label: string; value: string; align?: 'start' | 'end' }) {
  return (
    <div className={align === 'end' ? 'flex flex-col gap-1 text-right' : 'flex flex-col gap-1'}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
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
 * names the waybill alone, and puts the flight and the weight on the route line.
 */
function cargoWaybill(title: string): string {
  return title.split(' · ').slice(0, 2).join(' · ')
}

/** What the cargo frame writes in the middle of the route line: `FY214 · 180 kg`. */
function cargoLegend(title: string): string {
  return title.split(' · ').slice(2).join(' · ')
}

/**
 * The note the frame puts under the buttons: what this receipt says about a refund.
 *
 * A note the API sends for this receipt wins. Without one, the frames say something different for each kind of receipt —
 * what happens to the miles, what happens to a flight that has flown, who handles a cargo refund — so the note is picked
 * from the receipt itself.
 */
function refundNote(receipt: ReceiptDetailDto): string {
  if (receipt.refund_note) return receipt.refund_note
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
  const [refundOpen, setRefundOpen] = useState(false)
  const navigate = useNavigate()
  const refund = REFUND_STATE_COPY[receipt.refund_state]
  const { from, to } = ends(receipt)
  /* A flight that has already gone is written without its weekday, the way the frames write it. */
  const flown = receipt.receipt_status === 'flown'
  const note = tripNote(receipt)
  const cargo = receipt.source_feature === 17
  const download = receipt.document_type === 'invoice' ? 'Download invoice' : 'Download receipt'
  /* The frames' cargo panel offers its own button; a flight offers the refund its state allows. */
  const action = cargo ? CARGO_REFUND_ACTION : refund.action
  const actionHint = cargo ? 'Coming with the cargo feature' : undefined

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {receipt.document_number}
          </Badge>
          <ReceiptStateBadge status={receipt.receipt_status} />
          {/* The receipt state never changes, so a refunded payment says so separately. */}
          {receipt.status !== 'captured' && <ReceiptStatusBadge status={receipt.status} />}
        </div>
        {cargo ? (
          <p className="text-sm text-muted-foreground">{cargoWaybill(receipt.title)}</p>
        ) : (
          receipt.flight_number && (
            <p className="text-sm text-muted-foreground">
              Flight {receipt.flight_number}
              {note && ` · ${note}`}
            </p>
          )
        )}
      </div>

      {receipt.route ? (
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-2xl font-semibold">{from}</span>
            <span className="text-sm text-muted-foreground">{AIRPORT_CITIES[from] ?? from}</span>
          </div>
          <div className="flex flex-1 flex-col gap-2 pb-2">
            {(receipt.flight_date || cargo) && (
              <p className="text-center text-sm text-muted-foreground">
                {cargo ? cargoLegend(receipt.title) : formatFlightDate(receipt.flight_date ?? '', flown)}
              </p>
            )}
            <Separator />
          </div>
          <div className="flex flex-col text-right">
            <span className="text-2xl font-semibold">{to}</span>
            <span className="text-sm text-muted-foreground">{AIRPORT_CITIES[to] ?? to}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{receipt.source_feature_label}</p>
      )}

      <Separator />

      <div className="flex items-start justify-between gap-4">
        <Detail label="Booking" value={receipt.booking_reference ?? '—'} />
        <Detail label="Paid with" value={receipt.paid_with} align="end" />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">What you paid for</h3>
        <Table>
          <TableBody>
            {receipt.lines.map((line, index) => (
              <TableRow key={`${line.line_type}-${index}`}>
                <TableCell className="whitespace-normal">{line.description}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(line.amount)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Total charged</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {formatAmount(receipt.amount)} {receipt.currency}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {receipt.credit_note && (
        <>
          <Alert>
            <AlertDescription>
              Credit note {receipt.credit_note.document_number}: {receipt.credit_note.description ?? 'refund'}, −
              {formatAmount(receipt.credit_note.amount)} {receipt.currency}
            </AlertDescription>
          </Alert>
          {showCreditNote && (
            <dl className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-3">
              <Detail label="Credit note" value={receipt.credit_note.document_number} />
              <Detail label="Issued" value={formatDateTime(receipt.credit_note.issued_at)} />
              <Detail label="Refunded" value={`−${formatAmount(receipt.credit_note.amount)} ${receipt.currency}`} />
            </dl>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => downloadReceipt(receipt)}>
          {download}
        </Button>
        {/* A flight's refund is Feature 5b's: the button opens its request for this booking. Cargo has its own page. */}
        {action && (
          <Button type="button" variant="outline" disabled={cargo} title={actionHint} onClick={() => setRefundOpen(true)}>
            {action}
          </Button>
        )}
        {!cargo && receipt.refund_state === 'not_refundable' && <span className="text-sm text-muted-foreground">{refund.label}</span>}
        {receipt.credit_note && (
          <Button type="button" variant="outline" onClick={() => setShowCreditNote((shown) => !shown)}>
            View credit note
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">{refundNote(receipt)}</p>

      {refundOpen && (
        <RefundRequestDialog
          bookingReference={receipt.booking_reference}
          onClose={() => setRefundOpen(false)}
          onSent={() => undefined}
          onViewRefunds={() => void navigate({ to: '/refunds' })}
        />
      )}
    </div>
  )
}
