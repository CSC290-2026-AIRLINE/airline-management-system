import { Link } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
import { formatAmount, formatShortDateTime, providerLabel } from '../payment-copy'
import { PaymentStateHistory } from './PaymentStateHistory'
import { PaymentStatusBadge } from './PaymentStatusBadge'
import type { StaffPaymentDetailDto } from '../types'

/** A labelled value, the way the frames set them: a grey name over a dark value. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

/**
 * One payment, in full — the panel the frames open over the lookup.
 *
 * The reference and its state at the top, the facts the frame lists beside it (total, booking, customer and what the
 * money was paid with), what the money paid for on the left and every state the payment went through on the right.
 * Everything on it is read only: a staff member finds a payment and reads what happened to it.
 */
export function PaymentDetailPanel({ payment }: { payment: StaffPaymentDetailDto }) {
  const stalled = payment.capture_stalled_at !== null

  return (
    <div className="flex flex-col gap-6">
      {/* The payment ---------------------------------------------------- */}
      <div className="flex items-start justify-between gap-4 pr-12">
        <div>
          <h2 className="m-0 font-sans text-xl font-bold text-foreground">{payment.reference}</h2>
          <p className="mt-1 mb-0 text-sm text-muted-foreground">{formatShortDateTime(payment.started_at)}</p>
        </div>
        <PaymentStatusBadge status={payment.status} label={payment.status_label} />
      </div>

      {/* The facts the frame lists ---------------------------------------- */}
      <div className="grid grid-cols-4 gap-4 max-tablet:grid-cols-2">
        <Fact label="Total" value={`${formatAmount(payment.amount_total)} ${payment.currency}`} />
        <Fact label="Booking" value={payment.booking_reference ?? '—'} />
        <Fact label="Customer" value={payment.customer_email ?? payment.customer_name ?? '—'} />
        <Fact
          label="Paid with"
          value={`Provider: ${providerLabel(payment.provider)}${payment.card_last4 ? `, card ending ${payment.card_last4}` : ''}`}
        />
      </div>

      {/* The warning the frames put under the header -------------------- */}
      {stalled && (
        <p className="m-0 rounded-xl bg-warning-soft px-5 py-4 text-sm text-warning">
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
              <li
                key={`${line.line_type}-${index}`}
                className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0"
              >
                <span className="text-sm text-foreground">{line.description}</span>
                <span className="shrink-0 text-sm font-medium text-foreground tabular-nums">{formatAmount(line.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-4 border-t border-line pt-3">
            <span className="text-sm font-bold text-foreground">Total</span>
            <span className="text-sm font-bold text-foreground tabular-nums">
              {formatAmount(payment.amount_total)} {payment.currency}
            </span>
          </div>

          {stalled ? (
            <Button variant="outline" className="mt-5" asChild>
              <Link to="/payments/exceptions">Open in Payment exceptions</Link>
            </Button>
          ) : (
            /* Refunds are Feature 5b: the frame shows the button, but this release cannot open one yet.
               TODO(F5a): replace the placeholder with the refund the API returns for this payment. */
            <Button type="button" variant="outline" className="mt-5" disabled title="Coming with feature 5b">
              Open refund
            </Button>
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
