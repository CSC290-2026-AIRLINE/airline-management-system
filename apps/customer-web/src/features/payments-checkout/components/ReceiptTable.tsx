import { Card } from '@customer-web/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@customer-web/components/ui/table'
import { formatAmount, formatFlightDate, tripNote } from '../receipt-copy'
import { ReceiptStateBadge } from './ReceiptStatusBadge'
import type { ReceiptSummaryDto } from '../types'

interface ReceiptTableProps {
  receipts: ReceiptSummaryDto[]
  /** Opens one receipt. */
  onOpen: (receipt: ReceiptSummaryDto) => void
}

/** The line under the route: the flight and its day, or the cargo's waybill. */
function tripLine(receipt: ReceiptSummaryDto): string {
  if (receipt.source_feature === 17) return receipt.title
  if (!receipt.flight_number) return receipt.route ?? receipt.source_feature_label

  const parts = [`Flight ${receipt.flight_number}`]
  const note = tripNote(receipt)
  if (note) parts.push(note)
  if (receipt.flight_date) parts.push(formatFlightDate(receipt.flight_date, receipt.receipt_status === 'flown'))
  return parts.join(' · ')
}

/** The receipts list: shadcn's `Table` in a `Card`. A row opens its receipt, by click or by Enter or Space. */
export function ReceiptTable({ receipts, onOpen }: ReceiptTableProps) {
  return (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Receipt</TableHead>
            <TableHead>Trip</TableHead>
            <TableHead>Booking</TableHead>
            <TableHead>Paid with</TableHead>
            <TableHead className="text-right">Total (USD)</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receipts.map((receipt) => (
            <TableRow
              key={receipt.id}
              tabIndex={0}
              className="cursor-pointer"
              onClick={() => onOpen(receipt)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpen(receipt)
                }
              }}
            >
              <TableCell className="font-mono">{receipt.document_number}</TableCell>
              <TableCell>
                {receipt.route && <div className="font-medium">{receipt.route}</div>}
                <div className="text-xs text-muted-foreground">{tripLine(receipt)}</div>
              </TableCell>
              <TableCell className="font-mono">{receipt.booking_reference ?? '—'}</TableCell>
              <TableCell>{receipt.paid_with}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatAmount(receipt.amount)}</TableCell>
              <TableCell>
                <ReceiptStateBadge status={receipt.receipt_status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
