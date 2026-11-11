import { formatAmount, formatFlightDate, formatShortDate, tripNote } from '../receipt-copy'
import { ReceiptStateBadge } from './ReceiptStatusBadge'
import type { ReceiptSummaryDto } from '../types'

interface ReceiptTableProps {
  receipts: ReceiptSummaryDto[]
  /** Opens one receipt. The frames open the receipt over the list, in a panel. */
  onOpen: (receipt: ReceiptSummaryDto) => void
}

/**
 * The line under the route: the flight and its day, or the cargo's waybill.
 *
 * The frames write the flight as `Flight FY214 · Tue 17 Nov 2026` — the flight, the note that sits between it and the
 * day, and the day itself. A flight that has already gone has no weekday.
 */
function tripLine(receipt: ReceiptSummaryDto): string {
  if (receipt.source_feature === 17) return receipt.title
  if (!receipt.flight_number) return receipt.route ?? receipt.source_feature_label

  const parts = [`Flight ${receipt.flight_number}`]
  const note = tripNote(receipt)
  if (note) parts.push(note)
  if (receipt.flight_date) parts.push(formatFlightDate(receipt.flight_date, receipt.receipt_status === 'flown'))
  return parts.join(' · ')
}

/** The day the receipt was issued — what the phone frame shows under the document number. */
function receiptDate(receipt: ReceiptSummaryDto): string {
  return formatShortDate(receipt.issued_at)
}

/**
 * The receipts list, with the frames' columns: Receipt, Trip, Booking, Paid with, Total and Status.
 *
 * A desktop shows the table the frames draw; a phone shows the cards the phone frame draws — the document number and
 * the total, with the booking and the day underneath. The whole row is the button that opens the receipt, because the
 * frames' rows are tappable all the way across.
 */
export function ReceiptTable({ receipts, onOpen }: ReceiptTableProps) {
  return (
    <>
      {/* The cards, on a phone ------------------------------------------ */}
      <ul className="m-0 hidden list-none flex-col gap-3 p-0 max-tablet:flex">
        {receipts.map((receipt) => (
          <li key={receipt.id}>
            <button
              type="button"
              onClick={() => onOpen(receipt)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-base font-medium text-foreground">{receipt.document_number}</span>
                <span className="text-sm text-muted-foreground">
                  {receipt.booking_reference ? `${receipt.booking_reference} · ` : ''}
                  {receiptDate(receipt)}
                </span>
              </span>
              <span className="shrink-0 text-base font-semibold text-foreground tabular-nums">{formatAmount(receipt.amount)}</span>
            </button>
          </li>
        ))}
      </ul>

      {/* The table, on a desktop ----------------------------------------- */}
      <div className="overflow-hidden rounded-2xl border border-line bg-card max-tablet:hidden">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Receipt
              </th>
              <th scope="col" className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Trip
              </th>
              <th scope="col" className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Booking
              </th>
              <th scope="col" className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Paid with
              </th>
              <th scope="col" className="px-5 py-4 text-right text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Total (USD)
              </th>
              <th scope="col" className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
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
                className="cursor-pointer border-b border-line last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <td className="px-5 py-4 font-mono text-sm font-medium text-foreground">{receipt.document_number}</td>
                <td className="px-5 py-4">
                  {/* The route sits above the trip, the way the frames stack them. */}
                  {receipt.route && <span className="block text-sm font-semibold text-foreground">{receipt.route}</span>}
                  <span className="block text-xs text-muted-foreground">{tripLine(receipt)}</span>
                </td>
                <td className="px-5 py-4 font-mono text-sm tracking-wide text-foreground">{receipt.booking_reference ?? '—'}</td>
                <td className="px-5 py-4 text-sm text-foreground">{receipt.paid_with}</td>
                <td className="px-5 py-4 text-right text-sm font-semibold text-foreground tabular-nums">{formatAmount(receipt.amount)}</td>
                <td className="px-5 py-4">
                  <ReceiptStateBadge status={receipt.receipt_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
