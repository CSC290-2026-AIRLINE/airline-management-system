import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle, Clock, Loader2, XCircle } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Textarea } from '@staff-web/components/ui/textarea'
import { Route } from '@staff-web/routes/_authenticated/cargo/claims.$id'
import { useCargoApi, type ClaimDetail } from './cargo-api'

const CLAIM_STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

function ClaimStatusBadge({ status }: { status: string }) {
  const color = CLAIM_STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground'
  return (
    <Badge variant="outline" className={`border-transparent capitalize ${color}`}>
      {status}
    </Badge>
  )
}

function fmt(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}

export function ClaimDetailPage() {
  const { id } = Route.useParams()
  const api = useCargoApi()

  const [detail, setDetail] = useState<ClaimDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await api.getClaimDetail(id)
        if (!cancelled) setDetail(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load claim')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tick])

  const reload = () => setTick((n) => n + 1)

  if (loading && !detail) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !detail) {
    return (
      <>
        <BackLink />
        <p className="py-12 text-center text-sm text-destructive">{error}</p>
      </>
    )
  }

  if (!detail) return null

  const { booking, timeline, decision } = detail

  return (
    <>
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">{detail.claimRef}</h1>
        <ClaimStatusBadge status={detail.status} />
        <span className="ml-auto text-sm font-semibold">{money(detail.claimedAmount, detail.currency)}</span>
      </div>

      {/* Actions — only while open */}
      {detail.status === 'open' && (
        <DecisionActions claimId={detail.id} claimedAmount={detail.claimedAmount} currency={detail.currency} onDone={reload} />
      )}

      {/* Cards grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Claim */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Claim</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <span className="capitalize">{detail.claimType}</span>
            </Field>
            <Field label="Pieces affected">
              {detail.piecesAffected} of {detail.totalPieces}
            </Field>
            <div className="col-span-2">
              <Field label="Description">{detail.description}</Field>
            </div>
            <Field label="Filed at">{fmt(detail.filedAt)}</Field>
          </CardContent>
        </Card>

        {/* Booking */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Booking</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Booking ref">
              <Link
                to="/cargo/bookings/$id"
                params={{ id: booking.id }}
                search={{ status: 'all' }}
                className="text-sm font-medium underline underline-offset-2"
              >
                {booking.bookingRef}
              </Link>
            </Field>
            <Field label="AWB">{booking.awbNumber ?? '—'}</Field>
            <Field label="Shipper">{booking.shipperName}</Field>
            <Field label="Consignee">{booking.consigneeName}</Field>
            <Field label="Flight">
              {booking.flightNumber} · {fmtDate(booking.flightServiceDate)}
            </Field>
            <Field label="Commodity">{booking.commodityTypeName}</Field>
            <Field label="Pieces">{booking.pieces}</Field>
            <Field label="Charge">{money(booking.charge, booking.currency)}</Field>
          </CardContent>
        </Card>

        {/* Decision (once decided) */}
        {decision && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Decision</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Field label="Decision">
                <span className="capitalize">{decision.decision}</span>
              </Field>
              {decision.approvedAmount != null && <Field label="Approved amount">{money(decision.approvedAmount, detail.currency)}</Field>}
              <div className="col-span-2">
                <Field label="Note">{decision.note}</Field>
              </div>
              <Field label="Decided by">{decision.decidedBy}</Field>
              <Field label="Decided at">{fmt(decision.decidedAt)}</Field>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            <Clock className="mr-1 inline size-3.5" />
            Booking Timeline ({timeline.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No events.</p>
          ) : (
            <div className="relative space-y-0 pl-6">
              <div className="absolute left-2.5 top-1 bottom-1 w-px bg-border" />
              {timeline.map((e) => (
                <div key={e.id} className="relative pb-4">
                  <div className="absolute -left-[17px] top-1.5 size-2 rounded-full bg-foreground" />
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{fmt(e.occurredAt)}</span>
                      <span className="text-xs font-medium capitalize">{e.eventType.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-muted-foreground">by {e.actorType}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {e.statusBefore && (
                        <span className="text-muted-foreground">
                          {e.statusBefore.replace(/_/g, ' ')} → {e.statusAfter.replace(/_/g, ' ')}
                        </span>
                      )}
                      {e.airportCode && <span className="text-muted-foreground">at {e.airportCode}</span>}
                    </div>
                    {e.note && <p className="text-xs text-muted-foreground italic">{e.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function BackLink() {
  return (
    <Link
      to="/cargo/claims"
      search={{ status: 'all' }}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      Back to Claims
    </Link>
  )
}

function DecisionActions({
  claimId,
  claimedAmount,
  currency,
  onDone,
}: {
  claimId: string
  claimedAmount: number
  currency: string
  onDone: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ApproveDialog claimId={claimId} claimedAmount={claimedAmount} currency={currency} onDone={onDone} />
      <RejectDialog claimId={claimId} onDone={onDone} />
    </div>
  )
}

function ApproveDialog({
  claimId,
  claimedAmount,
  currency,
  onDone,
}: {
  claimId: string
  claimedAmount: number
  currency: string
  onDone: () => void
}) {
  const api = useCargoApi()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(claimedAmount))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedAmount = parseFloat(amount) || 0
  const valid = parsedAmount > 0 && parsedAmount <= claimedAmount && note.trim().length > 0

  const doApprove = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.decideClaim(claimId, { decision: 'approved', approved_amount: parsedAmount, note: note.trim() })
      setOpen(false)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setAmount(String(claimedAmount))
          setNote('')
          setError(null)
          setOpen(true)
        }}
      >
        <CheckCircle className="mr-1.5 size-4" />
        Approve
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Approve claim</DialogTitle>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="approve-amount">Approved amount ({currency})</Label>
              <Input
                id="approve-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={claimedAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Max: {money(claimedAmount, currency)}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="approve-note">Note (required)</Label>
              <Textarea id="approve-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy || !valid} onClick={doApprove}>
              {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
              Approve
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function RejectDialog({ claimId, onDone }: { claimId: string; onDone: () => void }) {
  const api = useCargoApi()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doReject = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.decideClaim(claimId, { decision: 'rejected', note: note.trim() })
      setOpen(false)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => {
          setNote('')
          setError(null)
          setOpen(true)
        }}
      >
        <XCircle className="mr-1.5 size-4" />
        Reject
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Reject claim</DialogTitle>
          <div className="flex flex-col gap-1.5 py-2">
            <Label htmlFor="reject-note">Reason (required)</Label>
            <Textarea id="reject-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={busy || !note.trim()} onClick={doReject}>
              {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
              Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
