import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { AlertCircle, Check, Loader2, Printer } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@customer-web/components/ui/alert'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Input } from '@customer-web/components/ui/input'
import { Label } from '@customer-web/components/ui/label'
import { Separator } from '@customer-web/components/ui/separator'
import { Skeleton } from '@customer-web/components/ui/skeleton'
import { Textarea } from '@customer-web/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@customer-web/components/ui/toggle-group'
import { useCustomerCargoApi, CargoApiError, type BookingDetail } from './cargo-api'
import CargoPage from './CargoPage'
import { PageCanvas, PageContent } from '@customer-web/components/Page'
import { CancelDialog } from './ReviewAndPayPage'

/* ── Formatting helpers ─────────────────────────────────────────── */

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function fmtDateShort(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

function fmtTimeShort(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

function fmtMoney(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtAwb(raw: string | null): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`
  return raw
}

function statusLabel(s: string): string {
  if (s === 'held') return 'Awaiting payment'
  if (s === 'in_transit') return 'In transit'
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/* ── Status pill colours ────────────────────────────────────────── */

function statusPill(s: string) {
  switch (s) {
    case 'held':
      return 'bg-amber-100 text-amber-800'
    case 'booked':
    case 'accepted':
    case 'loaded':
    case 'in_transit':
      return 'bg-blue-100 text-blue-800'
    case 'arrived':
      return 'bg-emerald-100 text-emerald-800'
    case 'delivered':
      return 'bg-emerald-100 text-emerald-800'
    case 'cancelled':
    case 'expired':
    case 'rejected':
      return 'bg-slate-100 text-slate-600'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

/* ── Status messages ────────────────────────────────────────────── */

function statusMessage(d: BookingDetail): string {
  switch (d.status) {
    case 'held':
      return `Your space is held. Pay before the hold expires to confirm your booking.`
    case 'booked':
      return `Paid and confirmed. Bring the cargo to the ${d.flight.origin} cargo terminal before departure.`
    case 'accepted':
      return `Your cargo has been accepted at the ${d.flight.origin} terminal and is being prepared for loading.`
    case 'loaded':
      return `Your cargo is loaded onto ${d.flight.flightNumber} and ready for departure.`
    case 'in_transit':
      return `Your cargo is on ${d.flight.flightNumber} heading to ${d.flight.destinationName}.`
    case 'arrived':
      return `Your cargo has arrived at ${d.flight.destinationName} (${d.flight.destination}). The consignee can collect it.`
    case 'delivered':
      return `Your cargo has been collected from the ${d.flight.destination} cargo terminal.`
    case 'cancelled':
      return `This booking has been cancelled.`
    case 'expired':
      return `The hold expired before payment. The space has been released.`
    case 'rejected':
      return `This booking was rejected. Contact cargo support for details.`
    default:
      return ''
  }
}

/* ── Stepper ────────────────────────────────────────────────────── */

/** Bookings that ended without shipping: their Air Waybill is void, so it is not offered for printing. */
const CLOSED_STATUSES = new Set(['cancelled', 'rejected', 'expired'])
const STEPPER_STEPS = ['booked', 'accepted', 'loaded', 'in_transit', 'arrived', 'delivered']
const STEPPER_LABELS = ['Booked', 'Accepted', 'Loaded', 'In transit', 'Arrived', 'Delivered']

function StatusStepper({ current }: { current: string }) {
  const idx = STEPPER_STEPS.indexOf(current)
  if (idx < 0) return null

  return (
    <div className="mt-5 flex items-start justify-between">
      {STEPPER_STEPS.map((step, i) => {
        const reached = i <= idx
        return (
          <div key={step} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {i > 0 && <div className={`h-0.5 flex-1 ${i <= idx ? 'bg-blue-600' : 'bg-slate-200'}`} />}
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  reached ? 'bg-blue-600 text-white' : 'border-2 border-slate-300 bg-white'
                }`}
              >
                {reached && <Check className="h-3.5 w-3.5" />}
              </div>
              {i < STEPPER_STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < idx ? 'bg-blue-600' : 'bg-slate-200'}`} />}
            </div>
            <span className={`mt-1.5 text-center text-[11px] ${reached ? 'font-medium text-blue-700' : 'text-slate-400'}`}>
              {STEPPER_LABELS[i]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Timeline ───────────────────────────────────────────────────── */

function timelineTitle(eventType: string): string {
  switch (eventType) {
    case 'held':
      return 'Held'
    case 'booked':
      return 'Paid and confirmed'
    case 'accepted':
      return 'Accepted at terminal'
    case 'loaded':
      return 'Loaded on aircraft'
    case 'departed':
      return 'Departed'
    case 'arrived':
      return 'Arrived'
    case 'delivered':
      return 'Delivered'
    case 'cancelled':
      return 'Cancelled'
    case 'expired':
      return 'Hold expired'
    case 'rejected':
      return 'Rejected'
    default:
      return eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }
}

function timelineDescription(event: BookingDetail['timeline'][number], d: BookingDetail): string {
  switch (event.eventType) {
    case 'held':
      return `${d.goods.declaredWeightKg} kg reserved on ${d.flight.flightNumber}`
    case 'booked':
      return `${fmtMoney(d.quote.currency, d.quote.charge)} paid. Air Waybill ${fmtAwb(d.awbNumber)} issued`
    case 'accepted':
      return `Measured ${event.measuredWeightKg ?? d.goods.declaredWeightKg} kg, ${event.measuredVolumeM3 ?? d.goods.declaredVolumeM3} m³. Your paid charge stays the same`
    case 'loaded':
      return `Loaded onto ${d.flight.flightNumber}`
    case 'departed':
      return `${d.flight.flightNumber} departed ${d.flight.origin}`
    case 'arrived':
      return `${d.flight.flightNumber} arrived at ${d.flight.destination}`
    case 'delivered':
      return `Collected from ${d.flight.destination} cargo terminal`
    case 'cancelled':
      return d.awbNumber ? 'Full refund' : 'Nothing to refund'
    case 'expired':
      return 'Hold expired. Space released'
    case 'rejected':
      return event.note ?? 'Booking rejected'
    default:
      return event.note ?? ''
  }
}

function isNegativeEvent(eventType: string): boolean {
  return eventType === 'cancelled' || eventType === 'expired' || eventType === 'rejected'
}

function ActivityTimeline({ detail }: { detail: BookingDetail }) {
  const events = detail.timeline

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {events.map((e, i) => {
            const neg = isNegativeEvent(e.eventType)
            return (
              <div key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
                {/* Vertical line */}
                {i < events.length - 1 && <div className="absolute top-4 left-[7px] h-full w-0.5 bg-border" />}
                {/* Dot */}
                <div className={`relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ${neg ? 'bg-destructive' : 'bg-blue-600'}`} />
                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-semibold">{timelineTitle(e.eventType)}</span>
                    <span className="text-xs text-muted-foreground">
                      {fmtTimeShort(e.occurredAt)} · {fmtDateShort(e.occurredAt)}
                      {e.airportCode ? ` · ${e.airportCode}` : ''}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{timelineDescription(e, detail)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/* ── AWB / Booking card (right column) ─────────────────────────── */

function AwbCard({ detail }: { detail: BookingDetail }) {
  const d = detail
  const f = d.flight
  const g = d.goods
  const q = d.quote
  const hasPaid = !!d.awbNumber

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <CardTitle className="text-base">{hasPaid ? 'Air Waybill' : 'Booking'}</CardTitle>
        {hasPaid && <span className="text-sm font-bold">{fmtAwb(d.awbNumber)}</span>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <AwbRow label="Flight" value={`${f.flightNumber} · ${f.origin} → ${f.destination}`} />
        <AwbRow label="Departs" value={fmtDateTime(f.depAt)} />
        <AwbRow label="Shipper" value={d.shipper.name} />
        <AwbRow label="Consignee" value={d.consignee.name} />
        <AwbRow label="Declared" value={`${g.declaredWeightKg} kg · ${g.declaredVolumeM3} m³`} />
        <AwbRow label="Chargeable weight" value={`${q.chargeableKg} kg`} />
        <AwbRow label="Rate" value={`${fmtMoney(q.currency, q.ratePerKg)} / kg`} />

        <Separator />

        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">{hasPaid ? 'Freight charge (paid)' : 'Amount due'}</span>
          <span className="text-xl font-bold">{fmtMoney(q.currency, q.charge)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function AwbRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

/* ── Status-specific info box (under right card) ───────────────── */

function statusInfoContent(d: BookingDetail): { title: string; message: string } | null {
  const f = d.flight
  switch (d.status) {
    case 'booked':
      return { title: 'Next step: at the terminal', message: `Staff weigh the cargo on ${fmtDate(f.depAt)}.` }
    case 'in_transit':
      return {
        title: 'On its way',
        message: `Your cargo is on ${f.flightNumber} to ${f.destinationName}. We will send you a notice when it lands.`,
      }
    case 'arrived':
      return {
        title: 'Ready for collection',
        message: `The cargo is at the ${f.destinationName} (${f.destination}) cargo terminal. The consignee can collect it with Air Waybill ${fmtAwb(d.awbNumber)}.`,
      }
    case 'accepted':
      return {
        title: 'Cancel through the cargo desk',
        message:
          'This cargo is already accepted at the terminal, so only the cargo desk can cancel it now. Cancelling is still free: the full amount is refunded.',
      }
    case 'loaded':
      return {
        title: 'Loaded on the aircraft',
        message: `Your cargo is loaded on ${f.flightNumber}, so the booking can no longer be cancelled.`,
      }
    default:
      return null
  }
}

function StatusInfoBox({ detail }: { detail: BookingDetail }) {
  const info = statusInfoContent(detail)
  if (!info) return null

  return (
    <Alert className="mt-4 border-blue-200 bg-blue-50 text-blue-900">
      <AlertTitle>{info.title}</AlertTitle>
      <AlertDescription className="text-blue-800">{info.message}</AlertDescription>
    </Alert>
  )
}

/* ── Cancelled info box ─────────────────────────────────────────── */

function CancelledBox({ detail }: { detail: BookingDetail }) {
  if (detail.status !== 'cancelled' && detail.status !== 'expired') return null

  const hadPaid = !!detail.awbNumber
  const f = detail.flight

  return (
    <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
      <AlertTitle>
        {hadPaid
          ? `Refunded ${fmtMoney(detail.quote.currency, detail.quote.charge)}`
          : detail.status === 'expired'
            ? 'Hold expired'
            : 'Booking cancelled'}
      </AlertTitle>
      <AlertDescription className="text-emerald-800">
        {hadPaid
          ? `A refund was issued. The weight on ${f.flightNumber} is free again.`
          : `Nothing was charged, so there is nothing to refund. The ${detail.goods.declaredWeightKg} kg on ${f.flightNumber} is free again.`}
      </AlertDescription>
    </Alert>
  )
}

/* ── Claim form ─────────────────────────────────────────────────── */

function ClaimForm({
  bookingId,
  pieces,
  onDone,
  onCancel,
}: {
  bookingId: string
  pieces: number
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const api = useCustomerCargoApi()
  const [claimType, setClaimType] = useState('damage')
  const [piecesAffected, setPiecesAffected] = useState('1')
  const [description, setDescription] = useState('')
  const [claimedAmount, setClaimedAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const formRef = useRef<HTMLDivElement>(null)

  // The form opens below the timeline, often off screen: bring it into view when "File a claim" opens it.
  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const valid =
    claimType && Number(piecesAffected) >= 1 && Number(piecesAffected) <= pieces && description.trim() && Number(claimedAmount) > 0

  async function handleSubmit() {
    if (!valid) return
    setSubmitting(true)
    setError('')
    try {
      await api.fileClaim(bookingId, {
        claim_type: claimType,
        pieces_affected: Number(piecesAffected),
        description: description.trim(),
        claimed_amount: Number(claimedAmount),
      })
      await onDone()
    } catch (err) {
      setError(err instanceof CargoApiError ? err.message : 'Failed to file claim')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div ref={formRef} className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">File a Claim</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2">
            <Label id="claimTypeLabel">Claim type</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={2}
              value={claimType}
              onValueChange={(v) => v && setClaimType(v)}
              aria-labelledby="claimTypeLabel"
            >
              {(['damage', 'loss'] as const).map((t) => (
                <ToggleGroupItem key={t} value={t} className="rounded-full px-3">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="piecesAffected">Pieces affected (1–{pieces})</Label>
              <Input
                id="piecesAffected"
                type="number"
                min="1"
                max={pieces}
                value={piecesAffected}
                onChange={(e) => setPiecesAffected(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="claimedAmount">Claimed amount</Label>
              <Input
                id="claimedAmount"
                type="number"
                min="0.01"
                step="0.01"
                value={claimedAmount}
                onChange={(e) => setClaimedAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="claimDesc">Description</Label>
            <Textarea
              id="claimDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the damage or loss"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSubmit} disabled={!valid || submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit claim
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ── Claim card ─────────────────────────────────────────────────── */

function ClaimCard({ claim }: { claim: NonNullable<BookingDetail['claim']> }) {
  const decisionPill =
    claim.decision?.decision === 'approved'
      ? 'bg-emerald-100 text-emerald-800'
      : claim.decision?.decision === 'rejected'
        ? 'bg-red-100 text-red-800'
        : 'bg-amber-100 text-amber-800'
  const decisionLabel = claim.decision ? (claim.decision.decision === 'approved' ? 'Approved' : 'Rejected') : 'Open'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <CardTitle className="text-base">Claim {claim.claimRef}</CardTitle>
        <Badge className={decisionPill}>{decisionLabel}</Badge>
      </CardHeader>

      <CardContent className="space-y-2 text-sm">
        <AwbRow label="Type" value={claim.claimType.charAt(0).toUpperCase() + claim.claimType.slice(1)} />
        <AwbRow label="Pieces affected" value={String(claim.piecesAffected)} />
        <AwbRow label="Claimed amount" value={fmtMoney(claim.currency, claim.claimedAmount)} />
        <AwbRow label="Filed" value={fmtDateTime(claim.filedAt)} />
        <div className="text-sm">
          <span className="text-muted-foreground">Description</span>
          <p className="mt-0.5">{claim.description}</p>
        </div>

        {claim.decision && (
          <>
            <Separator className="my-3" />
            <AwbRow label="Decision" value={claim.decision.decision.charAt(0).toUpperCase() + claim.decision.decision.slice(1)} />
            {claim.decision.approvedAmount != null && (
              <AwbRow label="Approved amount" value={fmtMoney(claim.currency, claim.decision.approvedAmount)} />
            )}
            <div className="text-sm">
              <span className="text-muted-foreground">Note</span>
              <p className="mt-0.5">{claim.decision.note}</p>
            </div>
            <AwbRow label="Decided" value={fmtDateTime(claim.decision.decidedAt)} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Main page ──────────────────────────────────────────────────── */

export default function ShipmentDetailPage() {
  const { id } = useParams({ from: '/_authenticated/cargo/bookings/$id/' })
  const api = useCustomerCargoApi()

  const [detail, setDetail] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  const [showClaim, setShowClaim] = useState(false)

  const confirmed =
    typeof window !== 'undefined' && ['true', '1'].includes(new URLSearchParams(window.location.search).get('confirmed') ?? '')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const d = await api.getBookingDetail(id)
      setDetail(d)
    } catch (err) {
      setError(err instanceof CargoApiError ? err.message : 'Failed to load booking')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  if (loading) {
    return (
      <PageCanvas>
        <PageContent width="wide" className="gap-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </PageContent>
      </PageCanvas>
    )
  }

  if (error || !detail) {
    return (
      <PageCanvas>
        <PageContent width="wide" className="gap-4">
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error || 'Booking not found'}</AlertDescription>
          </Alert>
          <Button asChild variant="link" className="mt-4 px-0">
            <Link to="/cargo">← Back to My Cargo</Link>
          </Button>
        </PageContent>
      </PageCanvas>
    )
  }

  const d = detail
  const f = d.flight
  const isHeld = d.status === 'held'
  const canCancel = d.status === 'held' || d.status === 'booked'
  const isDelivered = d.status === 'delivered'
  const canClaim = isDelivered && !d.claim
  const isCancelledOrExpired = d.status === 'cancelled' || d.status === 'expired'
  const showStepper = !isCancelledOrExpired && d.status !== 'rejected' && d.status !== 'held'

  const subtitle = d.awbNumber
    ? `Air Waybill ${fmtAwb(d.awbNumber)} · ${f.flightNumber} · ${f.origin} → ${f.destination}`
    : isCancelledOrExpired
      ? `${f.flightNumber} · ${f.origin} → ${f.destination} · no Air Waybill was issued`
      : `${f.flightNumber} · ${f.origin} → ${f.destination} · the Air Waybill is issued when you pay`

  return (
    <CargoPage
      title={d.bookingRef}
      titleRight={<Badge className={statusPill(d.status)}>{statusLabel(d.status)}</Badge>}
      subtitle={subtitle}
      activeTab="mycargo"
    >
      {/* Confirmed banner */}
      {confirmed && d.awbNumber && (
        <Alert className="mb-6 border-emerald-200 bg-emerald-50 text-emerald-900">
          <Check />
          <AlertTitle>Booking confirmed</AlertTitle>
          <AlertDescription className="text-emerald-800">
            {fmtMoney(d.quote.currency, d.quote.charge)} was paid. Your Air Waybill {fmtAwb(d.awbNumber)} is issued and you can print it
            now.
          </AlertDescription>
        </Alert>
      )}

      {/* Action row */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="link" className="px-0">
          <Link to="/cargo">← My cargo</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {isHeld && (
            <Button asChild>
              <Link to="/cargo/bookings/$id/pay" params={{ id: d.id }}>
                Pay now · {fmtMoney(d.quote.currency, d.quote.charge)}
              </Link>
            </Button>
          )}
          {d.awbNumber && !CLOSED_STATUSES.has(d.status) && (
            <Button asChild variant="outline">
              <Link to="/cargo/bookings/$id/waybill" params={{ id: d.id }}>
                <Printer className="mr-1.5 h-4 w-4" />
                Print Air Waybill
              </Link>
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setShowCancel(true)}
            >
              Cancel booking
            </Button>
          )}
          {canClaim && !showClaim && (
            <Button variant="outline" onClick={() => setShowClaim(true)}>
              File a claim
            </Button>
          )}
        </div>
      </div>

      {/* Shipment status card */}
      <Card className="mb-6">
        <CardContent>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Shipment status</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold">{statusLabel(d.status)}</span>
                <Badge className="bg-blue-100 text-blue-800">
                  {f.flightNumber} · {f.origin} → {f.destination}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{statusMessage(d)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Departs</p>
              <p className="text-sm font-semibold">{fmtDateTime(f.depAt)}</p>
            </div>
          </div>
          {showStepper && <StatusStepper current={d.status} />}
        </CardContent>
      </Card>

      {/* Cancelled box */}
      {isCancelledOrExpired && (
        <div className="mb-6">
          <CancelledBox detail={d} />
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left column */}
        <div className="space-y-6">
          {/* Activity timeline */}
          {d.timeline.length > 0 && <ActivityTimeline detail={d} />}

          {/* Claim form */}
          {showClaim && canClaim && (
            <ClaimForm
              bookingId={d.id}
              pieces={d.goods.pieces}
              onDone={async () => {
                setShowClaim(false)
                await load()
              }}
              onCancel={() => setShowClaim(false)}
            />
          )}

          {/* Claim card */}
          {d.claim && <ClaimCard claim={d.claim} />}
        </div>

        {/* Right column */}
        <div>
          <AwbCard detail={d} />
          <StatusInfoBox detail={d} />
        </div>
      </div>

      {/* Cancel dialog */}
      {showCancel && (
        <CancelDialog
          detail={d}
          onClose={() => setShowCancel(false)}
          onDone={() => {
            setShowCancel(false)
            void load()
          }}
        />
      )}
    </CargoPage>
  )
}

/* ── Print AWB ──────────────────────────────────────────────────── */
