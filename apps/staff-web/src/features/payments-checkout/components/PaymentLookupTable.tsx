import { Link } from '@tanstack/react-router'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { formatAmount, formatShortDateTime } from '../payment-copy'
import { PaymentStatusBadge } from './PaymentStatusBadge'
import type { StaffPaymentSummaryDto } from '../types'

interface PaymentLookupTableProps {
  payments: StaffPaymentSummaryDto[]
}

/**
 * The payment table, used by the lookup.
 *
 * The columns are the frames' own: Payment, Booking, Customer, Amount, Paid with and Status. The reference and the
 * time it started share the first cell, because the reference is what staff read out loud and the time is what they
 * check next.
 */
export function PaymentLookupTable({ payments }: PaymentLookupTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-160">
        <TableHeader>
          <TableRow>
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
            <TableRow key={payment.id}>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <Link
                    to="/payments/lookup/$paymentId"
                    params={{ paymentId: payment.id }}
                    className="font-mono text-xs underline underline-offset-4"
                  >
                    {payment.reference}
                  </Link>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatShortDateTime(payment.started_at)}</span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">{payment.booking_reference ?? '—'}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">{payment.customer_name ?? '—'}</span>
                  <span className="text-xs text-muted-foreground break-all">{payment.customer_email ?? '—'}</span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(payment.amount_total)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{payment.paid_with}</TableCell>
              <TableCell>
                <PaymentStatusBadge status={payment.status} label={payment.status_label} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
