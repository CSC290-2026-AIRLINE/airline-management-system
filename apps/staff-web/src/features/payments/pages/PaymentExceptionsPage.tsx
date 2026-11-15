import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { errorMessage, usePaymentsApi } from '../api'
import { formatDateTime, formatMoney, reasonLabel } from '../format'
import { useLoad } from '../useLoad'
import { ErrorAlert, LoadErrorCard, LoadingCard, PaymentsPage } from '../components/common'

/** Payment Exceptions: stalled captures (tickets and cargo) and failed refunds, with retry and the last error. */
export function PaymentExceptionsPage() {
  const api = usePaymentsApi()
  const data = useLoad(() => api.exceptions(), 'exceptions')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function retryPayout(payoutId: string) {
    setBusy(payoutId)
    setError(null)
    setMessage(null)
    try {
      const result = await api.retryPayout(payoutId)
      if (result.status === 'paid') setMessage('Payout sent.')
      else setError(result.failure_reason ?? 'The payout failed again')
      data.reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function retry(paymentId: string) {
    setBusy(paymentId)
    setError(null)
    setMessage(null)
    try {
      const result = await api.retryCapture(paymentId)
      if (result.ok) setMessage('Captured.')
      else setError(result.error ?? 'Capture failed again')
      data.reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <PaymentsPage
      title="Payment exceptions"
      description="Money that needs a person: captures that stalled after confirm, refunds the provider failed, and crew payouts that did not go through."
    >
      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {error && <ErrorAlert message={error} />}
      {data.loading && !data.data && <LoadingCard />}
      {data.error && <LoadErrorCard message={data.error} onRetry={data.reload} />}
      {data.data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Stalled captures ({data.data.stalled_captures.length})</CardTitle>
              <CardDescription>
                The booking is confirmed but the money was not taken. Retry, or cancel the booking in its own feature (the authorisation is
                then voided, nothing is refunded).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.data.stalled_captures.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Purchase</TableHead>
                      <TableHead>Stalled</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead>Last error</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.stalled_captures.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Link
                            to="/payments/lookup"
                            search={{ q: p.id, payment: p.id }}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {p.booking?.booking_reference
                              ? `Booking ${p.booking.booking_reference}`
                              : p.cargo_booking_payment_cargo_booking_idTocargo_booking
                                ? `Cargo ${p.cargo_booking_payment_cargo_booking_idTocargo_booking.booking_ref}`
                                : p.purchase_ref}
                          </Link>
                        </TableCell>
                        <TableCell>{formatDateTime(p.capture_stalled_at)}</TableCell>
                        <TableCell>{p.capture_attempts}</TableCell>
                        <TableCell className="max-w-64 truncate" title={p.last_error ?? undefined}>
                          {p.last_error ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(p.card_amount, p.currency)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" disabled={busy !== null} onClick={() => void retry(p.id)}>
                            {busy === p.id ? 'Retrying…' : 'Retry capture'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Failed refunds ({data.data.failed_refunds.length})</CardTitle>
              <CardDescription>Open one to reissue it as a voucher, with the customer's consent.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.data.failed_refunds.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Refund</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Failure</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.failed_refunds.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Link
                            to="/payments/refunds/$refundId"
                            params={{ refundId: r.id }}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {r.payment.booking?.booking_reference ?? r.payment.purchase_ref}
                          </Link>
                        </TableCell>
                        <TableCell>{reasonLabel(r.reason)}</TableCell>
                        <TableCell className="max-w-64 truncate" title={r.failure_reason ?? undefined}>
                          {r.failure_reason ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(r.amount, r.payment.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Failed crew payouts ({data.data.failed_payouts.length})</CardTitle>
              <CardDescription>
                Crew pay the payout provider refused. The person's lines stay in their run until the payout succeeds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.data.failed_payouts.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Crew member</TableHead>
                      <TableHead>Pay run</TableHead>
                      <TableHead>Last error</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.failed_payouts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          {p.crew.first_name} {p.crew.last_name}
                          <div className="text-xs text-muted-foreground">{p.crew.employee_number}</div>
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/payments/pay-runs/$runId"
                            params={{ runId: p.pay_run.id }}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {p.pay_run.period_start.slice(0, 10)} – {p.pay_run.period_end.slice(0, 10)}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-72 truncate" title={p.failure_reason ?? undefined}>
                          {p.failure_reason ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(p.amount, 'USD')}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" disabled={busy !== null} onClick={() => void retryPayout(p.id)}>
                            {busy === p.id ? 'Retrying…' : 'Retry payout'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PaymentsPage>
  )
}
