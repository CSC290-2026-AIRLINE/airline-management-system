import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Label } from '@staff-web/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { errorMessage, usePaymentsApi } from '../api'
import { formatDateTime, formatMoney, reasonLabel, refundStatus } from '../format'
import { useLoad } from '../useLoad'
import { ErrorAlert, LoadErrorCard, LoadingCard, NoteField, PaymentsPage, ToneBadge } from '../components/common'

type Action = 'approve' | 'reject' | 'reissue_voucher'

/** Refund Detail: lines, fee and policy check, then Approve, Reject (reason) or Reissue as voucher. */
export function RefundDetailPage({ refundId }: { refundId: string }) {
  const api = usePaymentsApi()
  const refund = useLoad(() => api.getRefund(refundId), refundId)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function act(action: Action) {
    if (note.trim().length < 3) {
      setError('A note is required for every decision.')
      return
    }
    setBusy(action)
    setError(null)
    setDone(null)
    try {
      await api.decideRefund(refundId, action, note.trim())
      setDone(action === 'approve' ? 'Approved and sent for payment.' : action === 'reject' ? 'Rejected.' : 'Reissued as a voucher.')
      setNote('')
      refund.reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (refund.error) {
    return (
      <PaymentsPage title="Refund" description="">
        <LoadErrorCard message={refund.error} onRetry={refund.reload} />
      </PaymentsPage>
    )
  }
  if (!refund.data) {
    return (
      <PaymentsPage title="Refund" description="">
        <LoadingCard />
      </PaymentsPage>
    )
  }
  const r = refund.data
  const currency = r.payment.currency
  const s = refundStatus(r.status)
  const decidable = r.status === 'requested' || r.status === 'pending_approval'
  const toVoucher = Number(r.voucher_amount)
  const toCard = Number(r.amount) - toVoucher

  return (
    <PaymentsPage
      title={`${reasonLabel(r.reason)} · ${formatMoney(r.amount, currency)}`}
      description={`${r.payment.booking ? `Booking ${r.payment.booking.booking_reference}` : r.payment.purchase_ref} · requested ${formatDateTime(r.requested_at)}`}
      actions={
        <Button variant="outline" asChild>
          <Link to="/payments/lookup" search={{ q: r.payment.id, payment: r.payment.id }}>
            Open payment
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Lines <ToneBadge tone={s.tone}>{s.label}</ToneBadge>
            </CardTitle>
            <CardDescription>Source key {r.source_key}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead className="text-right">Charged</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.refund_line.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      {l.payment_line.description} <span className="text-muted-foreground">· {l.payment_line.line_type}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.payment_line.amount, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.amount, currency)}</TableCell>
                  </TableRow>
                ))}
                {Number(r.fee_withheld) > 0 && (
                  <TableRow>
                    <TableCell>Cancellation fee withheld (fare rule)</TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums">{formatMoney(r.fee_withheld, currency)}</TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell className="font-semibold">
                    To card {formatMoney(toCard, currency)}
                    {toVoucher > 0 && ` · as voucher ${formatMoney(toVoucher, currency)}`}
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right font-semibold tabular-nums">{formatMoney(r.amount, currency)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Method</dt>
                <dd>{r.method === 'voucher' ? 'Voucher' : 'Original payment method'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Provider refund</dt>
                <dd>{r.provider_refund_id ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Completed</dt>
                <dd>{formatDateTime(r.completed_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Credit note</dt>
                <dd>{r.receipt?.document_number ?? '—'}</dd>
              </div>
              {r.compensation_voucher && (
                <div>
                  <dt className="text-muted-foreground">Voucher issued</dt>
                  <dd>
                    {r.compensation_voucher.code} ({r.compensation_voucher.status})
                  </dd>
                </div>
              )}
              {r.decision_note && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Note</dt>
                  <dd>{r.decision_note}</dd>
                </div>
              )}
              {r.failure_reason && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Failure</dt>
                  <dd className="text-danger">{r.failure_reason}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Policy check</CardTitle>
              <CardDescription>What the fare rules would refund today, before check-in.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Policy amount: <strong>{formatMoney(r.policy.policy_amount, currency)}</strong>
              </p>
              {r.policy.checked_in && <p className="text-warning">A passenger on this booking has checked in.</p>}
              <ToneBadge tone={r.policy.within ? 'good' : 'warn'}>
                {r.policy.within ? 'Within policy' : 'Outside policy — admin approval'}
              </ToneBadge>
              {r.audit_log && (
                <p>
                  Approved {formatDateTime(r.audit_log.occurred_at)} by {r.audit_log.actor_role ?? 'staff'} ·{' '}
                  <Link
                    to="/admin/audit-log/$auditId"
                    params={{ auditId: r.audit_log.id }}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    audit entry
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>

          {(decidable || r.status === 'failed') && (
            <Card>
              <CardHeader>
                <CardTitle>Decision</CardTitle>
                {r.status === 'failed' && <CardDescription>Reissue as a voucher only with the customer's consent.</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="decision-note">Note (required)</Label>
                  <NoteField id="decision-note" value={note} onChange={setNote} />
                </div>
                {error && <ErrorAlert message={error} />}
                <div className="flex flex-wrap gap-2">
                  {decidable && (
                    <>
                      <Button disabled={busy !== null} onClick={() => void act('approve')}>
                        {busy === 'approve' ? 'Approving…' : 'Approve'}
                      </Button>
                      <Button variant="outline" disabled={busy !== null} onClick={() => void act('reject')}>
                        {busy === 'reject' ? 'Rejecting…' : 'Reject'}
                      </Button>
                    </>
                  )}
                  {r.status === 'failed' && (
                    <Button disabled={busy !== null} onClick={() => void act('reissue_voucher')}>
                      {busy === 'reissue_voucher' ? 'Reissuing…' : 'Reissue as voucher'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          {done && (
            <Alert>
              <AlertDescription>{done}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </PaymentsPage>
  )
}
