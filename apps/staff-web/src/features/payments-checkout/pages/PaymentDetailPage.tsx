import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { retryCapture, voidPayment } from '../api/payments'
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
 * The capture-stalled panel is the reason this page exists: the card was authorised but the capture kept failing, so
 * the money is held and nobody has been charged. Staff can retry the capture or release the authorisation.
 */
export function PaymentDetailPage({ paymentId }: PaymentDetailPageProps) {
  const { loading, canOpen } = useScreenAccess()
  const detail = useStaffPayment(paymentId)
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  /* Runs one of the two staff actions and reloads the row, so the page shows what the action did. */
  async function runAction(action: () => Promise<unknown>) {
    setWorking(true)
    setActionError(null)
    try {
      await action()
      detail.reload()
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setWorking(false)
    }
  }

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
        <NoAccessScreen screenName="Payment lookup" homeTo="/dashboard" />
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
                <CardTitle className="text-lg">{payment.purchase_ref}</CardTitle>
                <CardDescription>
                  {payment.source_feature_label} · {payment.customer_name ?? payment.payer_customer_id ?? 'No payer on record'}
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
                  <Detail label="Started" value={formatDateTime(payment.started_at)} />
                  <Detail label="Deadline" value={formatDateTime(payment.expires_at)} />
                  <Detail label="Captured" value={formatDateTime(payment.captured_at)} />
                  <Detail label="Authorised" value={formatDateTime(payment.authorised_at)} />
                  <Detail label="Voided" value={formatDateTime(payment.voided_at)} />
                  <Detail label="Provider" value={payment.provider} />
                  <Detail label="Voucher share" value={formatMoney(payment.voucher_amount, payment.currency)} />
                  <Detail label="Card share" value={formatMoney(payment.card_amount, payment.currency)} />
                  <Detail
                    label="Provider fee"
                    value={payment.provider_fee === null ? '—' : formatMoney(payment.provider_fee, payment.currency)}
                  />
                  <Detail label="Capture attempts" value={String(payment.capture_attempts)} />
                  <Detail label="Receipt" value={payment.receipt_id ?? 'None'} />
                  <Detail label="Idempotency key" value={<span className="font-mono text-xs">{payment.idempotency_key}</span>} />
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
                    The card was authorised but the capture has not gone through. The customer has not been charged, and the
                    authorisation is still held.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <dl className="grid grid-cols-3 gap-4 max-phone:grid-cols-1">
                    <Detail label="Stalled since" value={formatDateTime(payment.capture_stalled_at)} />
                    <Detail label="Attempts" value={String(payment.capture_attempts)} />
                    <Detail label="Last error" value={errorLabel(payment.last_error)} />
                  </dl>

                  {actionError && (
                    <p className="m-0 text-sm text-danger" role="alert">
                      {actionError}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={working} onClick={() => void runAction(() => retryCapture(payment.id))}>
                      Retry capture
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={working}
                      onClick={() => void runAction(() => voidPayment(payment.id))}
                    >
                      Void the authorisation
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

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

            {/* The lines ------------------------------------------------- */}
            <Card className={PAYMENT_CARD}>
              <CardHeader>
                <CardTitle className="text-base">What the payment covered</CardTitle>
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
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </StaffPageShell>
  )
}
