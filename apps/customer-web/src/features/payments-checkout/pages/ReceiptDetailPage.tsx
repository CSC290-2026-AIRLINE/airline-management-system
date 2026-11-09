import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, CircleAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { CustomerShell } from '../components/CustomerShell'
import { ReceiptDetailSkeleton } from '../components/ReceiptSkeletons'
import { ReceiptStatusBadge } from '../components/ReceiptStatusBadge'
import { RefundRequestButton } from '../components/RefundRequestButton'
import { useReceipt } from '../hooks/useReceipt'
import { DOCUMENT_LABELS, formatDateTime, formatMiles, formatMoney } from '../receipt-copy'

interface ReceiptDetailPageProps {
  receiptId: string
}

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
 * The frame variants all live in this one page: a card payment, a booking paid with miles and cash, an award booking
 * with no cash at all, a cargo invoice, a fare that cannot be refunded, a flight that has already departed, and a
 * refunded payment with its credit note.
 */
export function ReceiptDetailPage({ receiptId }: ReceiptDetailPageProps) {
  const { loading, error, receipt, notFound } = useReceipt(receiptId)

  return (
    <CustomerShell
      title="Receipt"
      action={
        <Link
          to="/receipts"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All receipts
        </Link>
      }
    >
      {loading && <ReceiptDetailSkeleton />}

      {!loading && error && (
        <Card className={notFound ? '' : 'border-danger-line/40 bg-danger-soft'} role="alert">
          <CardContent className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
            <div>
              <h2 className="m-0 text-base font-semibold text-foreground">
                {notFound ? 'We could not find that receipt' : 'We could not load this receipt'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground break-words">{error}</p>
              {notFound && (
                <Link to="/receipts" className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-4">
                  Back to your receipts
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && !error && receipt && (
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
                <p className="m-0 text-3xl font-semibold text-foreground tabular-nums">
                  {formatMoney(receipt.amount, receipt.currency)}
                </p>
                <ReceiptStatusBadge status={receipt.status} />
              </div>

              <dl className="grid grid-cols-2 gap-4 max-phone:grid-cols-1">
                <Detail label="Issued" value={formatDateTime(receipt.issued_at)} />
                <Detail label="Booking" value={receipt.booking_reference ?? '—'} />
                <Detail
                  label="Paid with"
                  value={
                    receipt.card_brand
                      ? `${receipt.card_brand} ending ${receipt.card_last4}`
                      : receipt.amount === 0
                        ? 'Miles only — no card was charged'
                        : 'No card'
                  }
                />
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

          {/* The refund ------------------------------------------------------ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Refunds</CardTitle>
            </CardHeader>
            <CardContent>
              <RefundRequestButton state={receipt.refund_state} />
            </CardContent>
          </Card>
        </div>
      )}
    </CustomerShell>
  )
}
