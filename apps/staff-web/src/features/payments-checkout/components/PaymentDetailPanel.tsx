import { Link } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
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
    <div className="flex flex-col gap-4">
      {/* The payment ---------------------------------------------------- */}
      <div className="flex items-start justify-between gap-4 pr-14">
        <div className="min-w-0">
          <h2 className="m-0 font-sans text-xl font-bold text-foreground">{payment.reference}</h2>
          <p className="mt-1 mb-0 text-sm text-muted-foreground">{subtitle(payment)}</p>
        </div>
        <PaymentStatusBadge status={payment.status} label={payment.status_label} />
      </div>

      {/* The warning the frames put under the header -------------------- */}
      {stalled && (
        <p className="m-0 rounded-xl bg-warning-soft px-4 py-3 text-sm text-foreground">
          Booking is confirmed but the card charge has not completed after {payment.capture_attempts} attempts. The customer sees
          "Confirming payment". Retries continue; staff can follow up in Payment exceptions.
        </p>
      )}

      <div className="grid grid-cols-2 gap-8 max-tablet:grid-cols-1">
        {/* What the money paid for ------------------------------------- */}
        <div>
          <h3 className="m-0 border-b border-line pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            What was paid for
          </h3>
          <ul className="m-0 list-none p-0">
            {payment.lines.map((line, index) => (
              <li key={`${line.line_type}-${index}`} className="flex items-center justify-between gap-4 border-b border-line py-3">
                <span className="text-sm text-foreground">{line.description}</span>
                <span className="shrink-0 text-sm text-foreground tabular-nums">{formatAmount(line.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-4 pt-3">
            <span className="text-sm font-bold text-foreground">Total</span>
            <span className="text-sm font-bold text-foreground tabular-nums">
              {formatAmount(payment.amount_total)} {payment.currency}
            </span>
          </div>

          <p className="mt-5 mb-0 text-sm text-muted-foreground">
            Provider: {providerLabel(payment.provider)}
            {payment.card_last4 ? `, card ending ${payment.card_last4}` : ''}.
          </p>

          {stalled ? (
            <Button variant="outline" className="mt-3" asChild>
              <Link to="/payments/exceptions">Open in Payment exceptions</Link>
            </Button>
          ) : (
            /* A refund asked for on this payment is Feature 5b's: the button opens it in the refund queue. */
            payment.refund_reference && (
              <Button variant="outline" className="mt-3" asChild>
                <Link to="/payments/refunds/$refundId" params={{ refundId: payment.refund_reference }}>
                  Open refund {payment.refund_reference}
                </Link>
              </Button>
            )
          )}
        </div>

        {/* Every state it went through --------------------------------- */}
        <div>
          <h3 className="m-0 border-b border-line pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            State history
          </h3>
          <PaymentStateHistory steps={payment.state_history} />
        </div>
      </div>
    </div>
  )
}
