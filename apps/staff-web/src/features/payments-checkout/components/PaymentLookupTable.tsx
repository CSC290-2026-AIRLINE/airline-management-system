import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { formatAmount, formatShortDateTime } from '../payment-copy'
import { PaymentStatusBadge } from './PaymentStatusBadge'
import type { StaffPaymentSummaryDto } from '../types'

interface PaymentLookupTableProps {
  payments: StaffPaymentSummaryDto[]
  /** Opens one payment. The frames open the payment over the list, in a panel. */
  onOpen: (payment: StaffPaymentSummaryDto) => void
}

/**
 * The payment table, used by the lookup.
 *
 * The columns are the frames' own: Payment, Booking, Customer, Amount, Paid with and Status. The reference and the
 * time it started share the first cell, because the reference is what staff read out loud and the time is what they
 * check next.
 */
export function PaymentLookupTable({ payments, onOpen }: PaymentLookupTableProps) {
  return (
    <Table className="min-w-160">
      <TableHeader>
        <TableRow className="border-b border-border hover:bg-transparent">
          <TableHead>Payment</TableHead>
          <TableHead>Booking</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead className="text-right">Amount (USD)</TableHead>
          <TableHead>Paid with</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((payment) => (
          <TableRow
            key={payment.id}
            tabIndex={0}
            role="button"
            onClick={() => onOpen(payment)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpen(payment)
              }
            }}
            className="cursor-pointer border-b border-border last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <TableCell>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">{payment.reference}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatShortDateTime(payment.updated_at)}</span>
              </div>
            </TableCell>
            <TableCell className="text-sm font-medium text-foreground">{payment.booking_reference ?? '—'}</TableCell>
            <TableCell className="text-sm text-foreground" title={payment.customer_name ?? undefined}>
              {payment.customer_email ?? '—'}
            </TableCell>
            <TableCell className="text-right text-sm font-semibold text-foreground tabular-nums">
              {formatAmount(payment.amount_total)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{payment.paid_with}</TableCell>
            <TableCell>
              <PaymentStatusBadge status={payment.status} label={payment.status_label} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
