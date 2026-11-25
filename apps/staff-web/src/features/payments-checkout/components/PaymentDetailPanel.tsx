import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableRow } from '@staff-web/components/ui/table'
import { formatAmount, providerLabel } from '../payment-copy'
import { PaymentStateHistory } from './PaymentStateHistory'
import { PaymentStatusBadge } from './PaymentStatusBadge'
import type { StaffPaymentDetailDto } from '../types'

/** The line under the reference: `Booking K7QF2M · Stripe pi_3Q…x9A · FY214 YGN → BKK`. */
function subtitle(payment: StaffPaymentDetailDto): string {
  const provider = [providerLabel(payment.provider), payment.provider_reference].filter(Boolean).join(' ')
  return [payment.booking_reference ? `Booking ${payment.booking_reference}` : null, provider, payment.trip].filter(Boolean).join(' · ')
}

/**
 * One payment, in full — the panel the frames open over the lookup.
 *
 * The reference and its state at the top, with the booking, the provider and the flight under the reference; what the
 * money paid for on the left and every state the payment went through on the right. Everything on it is read only: a staff
 * member finds a payment and reads what happened to it.
 */
export function PaymentDetailPanel({ payment }: { payment: StaffPaymentDetailDto }) {
  const stalled = payment.capture_stalled_at !== null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="m-0 font-sans text-xl font-semibold">{payment.reference}</h2>
          <p className="text-sm text-muted-foreground">{subtitle(payment)}</p>
        </div>
        <PaymentStatusBadge status={payment.status} label={payment.status_label} />
      </div>

      {stalled && (
        <Alert>
          <AlertDescription>
            Booking is confirmed but the card charge has not completed after {payment.capture_attempts} attempts. The customer sees
            "Confirming payment". Retries continue; staff can follow up in Payment exceptions.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">What was paid for</h3>
          <Table>
            <TableBody>
              {payment.lines.map((line, index) => (
                <TableRow key={`${line.line_type}-${index}`}>
                  <TableCell className="whitespace-normal">{line.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(line.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatAmount(payment.amount_total)} {payment.currency}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <p className="text-sm text-muted-foreground">
            Provider: {providerLabel(payment.provider)}
            {payment.card_last4 ? `, card ending ${payment.card_last4}` : ''}.
          </p>

          {stalled ? (
            <Button variant="outline" className="w-fit" asChild>
              <Link to="/payments/exceptions">Open in Payment exceptions</Link>
            </Button>
          ) : (
            /* A refund asked for on this payment is Feature 5b's: the button opens it in the refund queue. */
            payment.refund_reference && (
              <Button variant="outline" className="w-fit" asChild>
                <Link to="/payments/refunds/$refundId" params={{ refundId: payment.refund_reference }}>
                  Open refund {payment.refund_reference}
                </Link>
              </Button>
            )
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">State history</h3>
          <PaymentStateHistory steps={payment.state_history} />
        </div>
      </div>
    </div>
  )
}
