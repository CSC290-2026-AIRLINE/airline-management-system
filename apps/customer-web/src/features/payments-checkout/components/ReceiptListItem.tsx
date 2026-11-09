import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { DOCUMENT_LABELS, formatDate, formatMiles, formatMoney } from '../receipt-copy'
import { ReceiptStatusBadge } from './ReceiptStatusBadge'
import type { ReceiptSummaryDto } from '../types'

/**
 * One receipt in the list.
 *
 * The whole row is the link — the frames show a tappable receipt row, and a link that is only the title is easy to miss
 * on a phone.
 */
export function ReceiptListItem({ receipt }: { receipt: ReceiptSummaryDto }) {
  return (
    <li>
      <Link
        to="/receipts/$receiptId"
        params={{ receiptId: receipt.id }}
        className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {DOCUMENT_LABELS[receipt.document_type]} · {receipt.document_number}
            </p>
            <p className="mt-1 truncate text-base font-semibold text-foreground">{receipt.title}</p>
          </div>
          <p className="shrink-0 text-base font-semibold text-foreground tabular-nums">{formatMoney(receipt.amount, receipt.currency)}</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <ReceiptStatusBadge status={receipt.status} />
          <span>{formatDate(receipt.issued_at)}</span>
          {receipt.booking_reference && <span>Booking {receipt.booking_reference}</span>}
          {receipt.miles_redeemed !== null && <span>{formatMiles(receipt.miles_redeemed)}</span>}
          {receipt.has_credit_note && <span className="text-muted-foreground">Refunded · credit note issued</span>}
        </div>

        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
          View receipt
          <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      </Link>
    </li>
  )
}
