import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Label } from '@staff-web/components/ui/label'
import { useRefundsApi } from '../api/refunds'
import { RefundsFrame } from '../components/RefundsFrame'
import { RefundStatusBadge } from '../components/RefundStatusBadge'
import { formatDateTime, formatMoney } from '../format'
import type { RefundDecision, RefundDetailDto } from '../types'

/** Feature 5b: one refund, with what a staff member needs to decide it (frames 03 to 03g). */
export function RefundDetailPage({ refundId }: { refundId: string }) {
  return (
    <RefundsFrame
      screenCode="f5.refund_queue"
      screenName="Refund queue"
      title="Refund"
      description="The request, the fare rule check, and your decision."
    >
      <Detail refundId={refundId} />
    </RefundsFrame>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Detail({ refundId }: { refundId: string }) {
  const api = useRefundsApi()
  const [refund, setRefund] = useState<RefundDetailDto | null>(null)
  const [missing, setMissing] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    api
      .getRefund(refundId)
      .then((result) => {
        if (!current) return
        setRefund(result)
        setMissing(result === null)
      })
      .catch((e: unknown) => {
        if (current) setError(e instanceof Error ? e.message : 'The refund could not be loaded.')
      })
    return () => {
      current = false
    }
    // `api` is rebuilt every render, so it stays out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refundId])

  async function decide(decision: RefundDecision) {
    if (!refund) return
    // The reason is required whatever the decision, and it is sent to the customer.
    if (reason.trim() === '') {
      setReasonError(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      setRefund(await api.decideRefund(refund.id, decision, reason.trim()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The decision could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <Link to="/payments/refunds" className="mb-4 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" /> Back to the queue
    </Link>
  )

  if (missing) {
    return (
      <>
        {back}
        <Alert variant="destructive">
          <AlertDescription className="block">No refund {refundId}.</AlertDescription>
        </Alert>
      </>
    )
  }
  if (!refund) {
    return (
      <>
        {back}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="block">{error}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">Loading refund…</p>
        )}
      </>
    )
  }

  const needsReview = refund.queue_tab === 'needs_review'
  /* A payout that failed stays in the queue for a person, but it is not sent to the card again from here: a lost first answer
   * could pay the customer twice. They can return it as a voucher or reject it. */
  const payoutFailed = refund.status === 'failed'

  return (
    <div className="space-y-4">
      {back}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 font-sans text-xl font-semibold text-foreground">{refund.reference}</h2>
        <RefundStatusBadge status={refund.status} label={refund.status_label} />
      </div>

      <section aria-labelledby="request-heading" className="rounded-lg border bg-card p-4">
        <h3 id="request-heading" className="mb-2 font-semibold text-foreground">
          Request
        </h3>
        <dl className="divide-y">
          <Row label="Booking">{refund.booking_reference}</Row>
          <Row label="Item">{refund.item}</Row>
          <Row label="Source">{refund.source_label}</Row>
          <Row label="Amount">{formatMoney(refund.amount, refund.currency)}</Row>
          <Row label="Paid by">{refund.paid_by}</Row>
          <Row label="Requested">{formatDateTime(refund.requested_at)}</Row>
          <Row label="Customer's reason">{refund.customer_reason ?? 'The system started this refund.'}</Row>
          <Row label="Fare rule check">
            <span className="font-medium">{refund.fare_rule.label}</span>
            <span className="mt-0.5 block text-muted-foreground">{refund.fare_rule.note}</span>
          </Row>
        </dl>
      </section>

      <section aria-labelledby="decision-heading" className="rounded-lg border bg-card p-4">
        <h3 id="decision-heading" className="mb-2 font-semibold text-foreground">
          Decision
        </h3>

        {needsReview ? (
          <div className="space-y-3">
            {payoutFailed && (
              <Alert variant="destructive">
                <AlertDescription className="block">
                  The payout to the card failed{refund.failure_reason ? ` (${refund.failure_reason})` : ''}. It is not sent to the card
                  again from here. Return it as a voucher, or reject it.
                </AlertDescription>
              </Alert>
            )}
            {refund.needs_override && (
              <Alert>
                <AlertDescription className="block">
                  Approving this refund overrides the fare rules. The override and your name are logged in the audit trail.
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="decision-reason">Reason (required, sent to the customer)</Label>
              <textarea
                id="decision-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  setReasonError(false)
                }}
                rows={3}
                maxLength={500}
                aria-invalid={reasonError}
                aria-describedby={reasonError ? 'decision-reason-error' : undefined}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive"
              />
              {reasonError && (
                <p id="decision-reason-error" role="alert" className="text-sm text-destructive">
                  A reason is required, and it is sent to the customer.
                </p>
              )}
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="block">{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {!payoutFailed && (
                <Button type="button" disabled={busy} onClick={() => void decide('approve_card')}>
                  Approve and refund to card
                </Button>
              )}
              <Button type="button" variant="outline" disabled={busy} onClick={() => void decide('approve_voucher')}>
                Approve as voucher instead
              </Button>
              <Button type="button" variant="destructive" disabled={busy} onClick={() => void decide('reject')}>
                Reject
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p role="status" className="font-medium">
              {outcomeSentence(refund)}
            </p>
            {refund.decision && (
              <dl className="divide-y">
                <Row label="Decided">
                  {formatDateTime(refund.decision.decided_at)}
                  {refund.decision.decided_by ? ` by ${refund.decision.decided_by}` : ''}
                </Row>
                {refund.decision.note && <Row label="Reason sent">{refund.decision.note}</Row>}
                {refund.decision.override && <Row label="Override">Approved outside the fare rules. Logged in the audit trail.</Row>}
                {refund.method === 'original' && refund.provider_refund_id && (
                  <Row label="Provider reference">{refund.provider_refund_id}</Row>
                )}
                {refund.credit_note_number && <Row label="Credit note">{refund.credit_note_number}</Row>}
              </dl>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

/** One sentence for a refund that is no longer waiting for review. */
function outcomeSentence(refund: RefundDetailDto): string {
  const amount = formatMoney(refund.amount, refund.currency)
  switch (refund.status) {
    case 'approved':
    case 'processing':
      return `Approved · paying ${amount} to the card.`
    case 'succeeded':
      return refund.method === 'voucher'
        ? `Voucher issued${refund.voucher_code ? ` · ${refund.voucher_code}` : ''} for ${amount}.`
        : `Refunded ${amount} to the card.`
    case 'rejected':
      return 'Rejected. The customer has been sent your reason.'
    case 'failed':
      return 'The payout failed and needs a second look.'
    case 'requested':
    case 'pending_approval':
      return 'Needs review.'
    default: {
      const unreachable: never = refund.status
      return unreachable
    }
  }
}
