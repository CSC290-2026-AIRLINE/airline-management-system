import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { PaymentStateHistory } from '../components/PaymentStateHistory'
import { PaymentStatusBadge } from '../components/PaymentStatusBadge'
import { PageMessage, PAYMENT_CARD, StaffPageShell } from '../components/StaffPageShell'
import { useStaffPayment } from '../hooks/useStaffPayment'
import { errorLabel, formatDateTime, formatMoney } from '../payment-copy'

interface PaymentDetailPageProps {
  paymentId: string
}

/** A labelled value in the details grid. */
function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="m-0 text-sm text-foreground break-words">{value}</dd>
    </div>
  )
}

/**
 * One payment in full, for staff.
 *
 * The page is read only, the way the frames say it is: it shows what the payment was for, what it cost, how it was paid
 * for and every state it went through. The only thing a staff member can do from here is open the exception list, where
 * the actions live.
 */
export function PaymentDetailPage({ paymentId }: PaymentDetailPageProps) {
  const { loading, canOpen, role } = useScreenAccess()
  const detail = useStaffPayment(paymentId)

  if (loading) {
    return (
      <StaffPageShell title="Payment detail">
        <p className="text-sm text-muted-foreground">Checking your access…</p>
      </StaffPageShell>
    )
  }

  if (!canOpen('f5.payment_lookup')) {
    return (
      <StaffPageShell title="Payment detail">
        {/* `recorded={false}`: the page is refused before any API call, so no `access_denied` row exists for this
            attempt. The backend guard records the ones that reach it. */}
        <NoAccessScreen screenName="Payment lookup" roleName={role?.name} recorded={false} homeTo="/dashboard" />
      </StaffPageShell>
    )
  }

  const payment = detail.payment

  return (
    <StaffPageShell
      title="Payment detail"
      action={
        <Link
          to="/payments/lookup"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Payment lookup
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        {detail.error && (
          <PageMessage
            tone="danger"
            title={detail.notFound ? 'We could not find that payment' : 'The payment could not be loaded'}
            body={detail.error}
          />
        )}

        {!detail.error && detail.loading && (
          <Card className={PAYMENT_CARD}>
            <CardContent>
              <p className="text-sm text-muted-foreground" role="status">
                Loading the payment…
              </p>
            </CardContent>
          </Card>
        )}

        {payment && (
          <>
            {/* The payment ------------------------------------------------ */}
            <Card className={PAYMENT_CARD}>
              <CardHeader>
                <CardTitle className="font-mono text-lg">{payment.reference}</CardTitle>
                <CardDescription>
                  {payment.source_feature_label}
                  {payment.booking_reference ? ` · ${payment.booking_reference}` : ''} ·{' '}
                  {payment.customer_name ?? payment.payer_customer_id ?? 'No payer on record'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="m-0 text-2xl font-semibold text-foreground tabular-nums">
                    {formatMoney(payment.amount_total, payment.currency)}
                  </p>
                  <PaymentStatusBadge status={payment.status} label={payment.status_label} />
                </div>

                <dl className="grid grid-cols-3 gap-4 max-tablet:grid-cols-2 max-phone:grid-cols-1">
                  <Detail label="Paid with" value={payment.paid_with} />
                  <Detail label="Customer" value={payment.customer_email ?? payment.customer_name ?? '—'} />
                  <Detail label="Booking" value={payment.booking_reference ?? '—'} />
                  <Detail label="Started" value={formatDateTime(payment.started_at)} />
                  <Detail label="Deadline" value={formatDateTime(payment.expires_at)} />
                  <Detail label="Captured" value={formatDateTime(payment.captured_at)} />
                  <Detail label="Voucher share" value={formatMoney(payment.voucher_amount, payment.currency)} />
                  <Detail label="Card share" value={formatMoney(payment.card_amount, payment.currency)} />
                  <Detail
                    label="Provider fee"
                    value={payment.provider_fee === null ? '—' : formatMoney(payment.provider_fee, payment.currency)}
                  />
                  <Detail label="Capture attempts" value={String(payment.capture_attempts)} />
                  <Detail label="Receipt" value={payment.receipt_id ?? 'None'} />
                  <Detail label="Provider" value={payment.provider} />
                </dl>

                {payment.last_error && (
                  <p className="m-0 flex items-center gap-2 text-sm text-danger">
                    <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                    {errorLabel(payment.last_error)}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* The capture-stalled panel ---------------------------------- */}
            {payment.capture_stalled_at && (
              <Card className="border-warning/50 bg-warning-soft">
                <CardHeader>
                  <CardTitle className="text-base">Capture stalled</CardTitle>
                  <CardDescription>
                    The card was authorised but the capture has not gone through. The customer has not been charged, and the authorisation
                    is still held.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <dl className="grid grid-cols-3 gap-4 max-phone:grid-cols-1">
                    <Detail label="Stalled since" value={formatDateTime(payment.capture_stalled_at)} />
                    <Detail label="Attempts" value={String(payment.capture_attempts)} />
                    <Detail label="Last error" value={errorLabel(payment.last_error)} />
                  </dl>

                  <Link
                    to="/payments/exceptions"
                    className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Open in Payment exceptions
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* What was paid for, and how it went ----------------------- */}
            <div className="grid grid-cols-2 gap-4 max-tablet:grid-cols-1">
              <Card className={PAYMENT_CARD}>
                <CardHeader>
                  <CardTitle className="text-base">What was paid for</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {payment.lines.map((line, index) => (
                      <li
                        key={`${line.line_type}-${index}`}
                        className="flex items-start justify-between gap-4 border-b border-border pb-2 last:border-b-0 last:pb-0"
                      >
                        <span className="text-sm text-foreground">{line.description}</span>
                        <span className="shrink-0 text-sm font-medium text-foreground tabular-nums">
                          {formatMoney(line.amount, payment.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
                    <Detail
                      label="Miles redeemed"
                      value={payment.miles_redeemed === null ? '—' : payment.miles_redeemed.toLocaleString('en-US')}
                    />
                    <Detail label="Total" value={formatMoney(payment.amount_total, payment.currency)} />
                  </dl>
                </CardContent>
              </Card>

              <Card className={PAYMENT_CARD}>
                <CardHeader>
                  <CardTitle className="text-base">State history</CardTitle>
                  <CardDescription>Every state this payment went through, oldest first.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PaymentStateHistory steps={payment.state_history} />
                </CardContent>
              </Card>
            </div>

            {/* The exception --------------------------------------------- */}
            {payment.exception && (
              <Card className={PAYMENT_CARD}>
                <CardHeader>
                  <CardTitle className="text-base">Exception</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-3 gap-4 max-phone:grid-cols-1">
                    <Detail label="State" value={payment.exception.state.replace(/_/g, ' ')} />
                    <Detail label="Detected" value={formatDateTime(payment.exception.detected_at)} />
                    <Detail label="Resolved" value={formatDateTime(payment.exception.resolved_at)} />
                    <Detail label="Resolved by" value={payment.exception.resolved_by ?? '—'} />
                    <Detail label="Resolution" value={payment.exception.resolution ?? '—'} />
                    <Detail label="Note" value={payment.exception.note ?? '—'} />
                  </dl>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </StaffPageShell>
  )
}
