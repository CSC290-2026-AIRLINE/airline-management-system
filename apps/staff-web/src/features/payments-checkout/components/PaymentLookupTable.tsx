import { Link } from '@tanstack/react-router'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { formatDateTime, formatMoney } from '../payment-copy'
import { PaymentStatusBadge } from './PaymentStatusBadge'
import type { StaffPaymentSummaryDto } from '../types'

interface PaymentLookupTableProps {
  payments: StaffPaymentSummaryDto[]
}

/**
 * The payment table, used by both the lookup and the exception list.
 *
 * Every row links to the payment detail, which is where the capture-stalled panel and the staff actions live.
 */
export function PaymentLookupTable({ payments }: PaymentLookupTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-190">
        <TableHeader>
          <TableRow>
            <TableHead>Started</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Purchase</TableHead>
            <TableHead>Feature</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={payment.id}>
              <TableCell className="tabular-nums">{formatDateTime(payment.started_at)}</TableCell>
              <TableCell className="max-w-40 truncate">{payment.customer_name ?? payment.payer_customer_id ?? '—'}</TableCell>
              <TableCell className="max-w-52">
                <Link
                  to="/payments/lookup/$paymentId"
                  params={{ paymentId: payment.id }}
                  className="font-mono text-xs underline underline-offset-4"
                >
                  {payment.purchase_ref}
                </Link>
              </TableCell>
              <TableCell>{payment.source_feature_label}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(payment.amount_total, payment.currency)}</TableCell>
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
