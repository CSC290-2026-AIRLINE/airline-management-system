import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { DOCUMENT_LABELS, formatDateTime, formatMiles, formatMoney, REFUND_STATE_COPY } from '../receipt-copy'
import { ReceiptStateBadge, ReceiptStatusBadge } from './ReceiptStatusBadge'
import type { ReceiptDetailDto } from '../types'

/** A labelled value in the details grid. */
function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="m-0 text-sm text-foreground">{value}</dd>
    </div>
  )
}

/**
 * One receipt, in full.
 *
 * The frame variants all live in here: a card payment, a booking paid with miles and cash, an award booking with no
 * cash at all, a cargo invoice, a fare that cannot be refunded, a flight that has already departed, and a refunded
 * payment with its credit note. The receipts list opens this over the list; the receipt route shows it on its own page.
 */
export function ReceiptDetailBody({ receipt }: { receipt: ReceiptDetailDto }) {
  const refund = REFUND_STATE_COPY[receipt.refund_state]

  return (
    <div className="flex flex-col gap-4">
      {/* The document ---------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{DOCUMENT_LABELS[receipt.document_type]}</CardTitle>
          <CardDescription>
            {receipt.document_number} · {receipt.source_feature_label}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-3xl font-semibold text-foreground tabular-nums">{formatMoney(receipt.amount, receipt.currency)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <ReceiptStateBadge status={receipt.receipt_status} />
              {/* The receipt state never changes, so a refunded payment says so separately. */}
              {receipt.status !== 'captured' && <ReceiptStatusBadge status={receipt.status} />}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 max-phone:grid-cols-1">
            <Detail label="Issued" value={formatDateTime(receipt.issued_at)} />
            <Detail label="Booking" value={receipt.booking_reference ?? '—'} />
            <Detail label="Trip" value={receipt.route ?? '—'} />
            <Detail label="Flight" value={receipt.flight_number ?? '—'} />
            <Detail label="Paid with" value={receipt.paid_with} />
            {receipt.miles_redeemed !== null && <Detail label="Miles redeemed" value={formatMiles(receipt.miles_redeemed)} />}
            {receipt.billing_name && <Detail label="Billed to" value={receipt.billing_name} />}
          </dl>
        </CardContent>
      </Card>

      {/* What the money paid for ---------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What this payment covered</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {receipt.lines.map((line, index) => (
              <li
                key={`${line.line_type}-${index}`}
                className="flex items-start justify-between gap-4 border-b border-border pb-2 last:border-b-0 last:pb-0"
              >
                <span className="text-sm text-foreground">{line.description}</span>
                <span className="shrink-0 text-sm font-medium text-foreground tabular-nums">
                  {formatMoney(line.amount, receipt.currency)}
                </span>
              </li>
            ))}
          </ul>
          {receipt.voucher_amount > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              A voucher covered {formatMoney(receipt.voucher_amount, receipt.currency)} of this total.
            </p>
          )}
        </CardContent>
      </Card>

      {/* The credit note ------------------------------------------------- */}
      {receipt.credit_note && (
        <Card className="border-secondary">
          <CardHeader>
            <CardTitle className="text-base">Credit note</CardTitle>
            <CardDescription>This payment was refunded. The credit note below replaces the amount charged.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 max-phone:grid-cols-1">
              <Detail label="Credit note" value={receipt.credit_note.document_number} />
              <Detail label="Issued" value={formatDateTime(receipt.credit_note.issued_at)} />
              <Detail label="Refunded" value={formatMoney(receipt.credit_note.amount, receipt.currency)} />
            </dl>
          </CardContent>
        </Card>
      )}

      {/* The refund state ------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Refunds</CardTitle>
          <CardDescription>Where this fare stands.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="m-0 text-sm font-semibold text-foreground">{refund.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{refund.note}</p>
        </CardContent>
      </Card>
    </div>
  )
}
