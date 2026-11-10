import { formatAmount } from '../receipt-copy'
import { ReceiptStateBadge } from './ReceiptStatusBadge'
import type { ReceiptSummaryDto } from '../types'

interface ReceiptTableProps {
  receipts: ReceiptSummaryDto[]
  /** Opens one receipt. The frames open the receipt over the list, in a panel. */
  onOpen: (receipt: ReceiptSummaryDto) => void
}

/**
 * The receipts list, with the frames' columns: Receipt, Trip, Booking, Paid with, Total and Status.
 *
 * The whole row is the button that opens the receipt, because the frames' rows are tappable all the way across.
 */
export function ReceiptTable({ receipts, onOpen }: ReceiptTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-140 border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Receipt
            </th>
            <th scope="col" className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Trip
            </th>
            <th scope="col" className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Booking
            </th>
            <th scope="col" className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Paid with
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Total (USD)
            </th>
            <th scope="col" className="px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {receipts.map((receipt) => (
            <tr
              key={receipt.id}
              tabIndex={0}
              role="button"
              onClick={() => onOpen(receipt)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpen(receipt)
                }
              }}
              className="cursor-pointer border-b border-border last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <td className="px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs text-foreground">{receipt.document_number}</span>
                  <span className="text-xs text-muted-foreground">{receipt.source_feature_label}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">{receipt.route ?? '—'}</span>
                  {receipt.flight_number && <span className="text-xs text-muted-foreground">{receipt.flight_number}</span>}
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-foreground">{receipt.booking_reference ?? '—'}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{receipt.paid_with}</td>
              <td className="px-4 py-3 text-right text-sm font-medium text-foreground tabular-nums">{formatAmount(receipt.amount)}</td>
              <td className="px-4 py-3">
                <ReceiptStateBadge status={receipt.receipt_status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
