import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, AlertCircle, Clock, Loader2, Plane, Package, MapPin, FileText, Printer } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Badge } from '@customer-web/components/ui/badge'
import { Input } from '@customer-web/components/ui/input'
import { Label } from '@customer-web/components/ui/label'
import { useCustomerCargoApi, CargoApiError, type BookingDetail } from './cargo-api'

function statusVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (s) {
    case 'held':
      return 'outline'
    case 'booked':
    case 'accepted':
    case 'loaded':
    case 'in_transit':
    case 'arrived':
      return 'default'
    case 'delivered':
      return 'secondary'
    case 'cancelled':
    case 'expired':
    case 'rejected':
      return 'destructive'
    default:
      return 'outline'
  }
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function ShipmentDetailPage() {
  const { id } = useParams({ from: '/_authenticated/cargo/bookings/$id' })
  const api = useCustomerCargoApi()

  const [detail, setDetail] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          {error || 'Booking not found'}
        </div>
        <Link to="/cargo" className="mt-4 inline-block text-sm text-primary underline">
          ← Back to My Cargo
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/cargo" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> My Cargo
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{detail.bookingRef}</h1>
        <Badge variant={statusVariant(detail.status)}>{statusLabel(detail.status)}</Badge>
        {detail.awbNumber && <span className="text-sm text-muted-foreground">AWB {detail.awbNumber}</span>}
      </div>

      <div className="grid gap-4">
        {/* Actions */}
        <ActionSection detail={detail} onReload={load} />

        {/* Goods */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" /> Goods
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Dt>Commodity</Dt>
              <Dd>{detail.goods.commodityTypeName}</Dd>
              <Dt>Handling</Dt>
              <Dd className="capitalize">{detail.goods.handlingClass}</Dd>
              <Dt>Pieces</Dt>
              <Dd>{detail.goods.pieces}</Dd>
              <Dt>Weight</Dt>
              <Dd>{detail.goods.declaredWeightKg} kg</Dd>
              <Dt>Volume</Dt>
              <Dd>{detail.goods.declaredVolumeM3} m³</Dd>
              {detail.goods.unNumber && (
                <>
                  <Dt>UN Number</Dt>
                  <Dd>{detail.goods.unNumber}</Dd>
                </>
              )}
              <Dt>Description</Dt>
              <Dd className="col-span-full sm:col-span-2">{detail.goods.goodsDescription}</Dd>
            </dl>
          </CardContent>
        </Card>

        {/* Price */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Price</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Dt>Distance</Dt>
              <Dd>{detail.quote.distanceKm} km</Dd>
              <Dt>Chargeable kg</Dt>
              <Dd>{detail.quote.chargeableKg} kg</Dd>
              <Dt>Rate per kg</Dt>
              <Dd>
                {detail.quote.currency} {detail.quote.ratePerKg.toFixed(2)}
              </Dd>
              <Dt>Charge</Dt>
              <Dd className="font-semibold">
                {detail.quote.currency} {detail.quote.charge.toFixed(2)}
              </Dd>
            </dl>
          </CardContent>
        </Card>

        {/* Flight */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plane className="h-4 w-4" /> Flight
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Dt>Flight</Dt>
              <Dd>{detail.flight.flightNumber}</Dd>
              <Dt>Route</Dt>
              <Dd>
                {detail.flight.origin} → {detail.flight.destination}
              </Dd>
              <Dt>Departure</Dt>
              <Dd>{new Date(detail.flight.depAt).toLocaleString()}</Dd>
              <Dt>Arrival</Dt>
              <Dd>{new Date(detail.flight.arrAt).toLocaleString()}</Dd>
            </dl>
          </CardContent>
        </Card>

        {/* Shipper & Consignee */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" /> Shipper & Consignee
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Shipper</p>
                <p className="text-sm font-medium">{detail.shipper.name}</p>
                {detail.shipper.phone && <p className="text-sm text-muted-foreground">{detail.shipper.phone}</p>}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Consignee</p>
                <p className="text-sm font-medium">{detail.consignee.name}</p>
                <p className="text-sm text-muted-foreground">{detail.consignee.address}</p>
                {detail.consignee.phone && <p className="text-sm text-muted-foreground">{detail.consignee.phone}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Air Waybill */}
        {detail.awbNumber && <AirWaybill detail={detail} />}

        {/* Claim */}
        {detail.claim && <ClaimCard claim={detail.claim} />}

        {/* Timeline */}
        {detail.timeline.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" /> Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {detail.timeline.map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <time className="shrink-0 text-muted-foreground">{new Date(e.occurredAt).toLocaleString()}</time>
                    <div>
                      <span className="font-medium capitalize">{e.eventType.replace(/_/g, ' ')}</span>
                      {e.airportCode && <span className="ml-1 text-muted-foreground">at {e.airportCode}</span>}
                      {e.note && <p className="text-muted-foreground">{e.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-muted-foreground">{children}</dt>
}

function Dd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dd className={className}>{children}</dd>
}

/* ── Action section ──────────────────────────────────────────────── */

function ActionSection({ detail, onReload }: { detail: BookingDetail; onReload: () => Promise<void> }) {
  const api = useCustomerCargoApi()
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  const isHeld = detail.status === 'held'
  const isBooked = detail.status === 'booked'
  const isDelivered = detail.status === 'delivered'
  const canCancel = isHeld || isBooked
  const canClaim = isDelivered && !detail.claim
  const canMockPay = isHeld && detail.mock_payment_available

  const [showCancel, setShowCancel] = useState(false)
  const [showClaim, setShowClaim] = useState(false)

  async function handleMockPay() {
    setActionLoading(true)
    setActionError('')
    try {
      await api.mockPay(detail.id)
      await onReload()
    } catch (err) {
      setActionError(err instanceof CargoApiError ? err.message : 'Payment failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCancel() {
    setActionLoading(true)
    setActionError('')
    try {
      await api.cancelBooking(detail.id)
      setShowCancel(false)
      await onReload()
    } catch (err) {
      setActionError(err instanceof CargoApiError ? err.message : 'Cancellation failed')
    } finally {
      setActionLoading(false)
    }
  }

  if (!canMockPay && !canCancel && !canClaim && !isHeld) return null

  return (
    <Card>
      <CardContent className="grid gap-3 p-4">
        {isHeld && (
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <Clock className="h-4 w-4" />
            Hold expires {new Date(detail.holdExpiresAt).toLocaleString()}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {canMockPay && (
            <Button onClick={handleMockPay} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Pay now (test payment)
            </Button>
          )}
          {canCancel && !showCancel && (
            <Button variant="destructive" onClick={() => setShowCancel(true)}>
              Cancel booking
            </Button>
          )}
          {canClaim && !showClaim && (
            <Button variant="outline" onClick={() => setShowClaim(true)}>
              <FileText className="mr-1 h-4 w-4" /> File a claim
            </Button>
          )}
        </div>

        {showCancel && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4">
            <p className="mb-3 text-sm">
              {isHeld
                ? 'Cancel this booking? Nothing has been charged.'
                : `Cancel this booking? A full refund of ${detail.quote.currency} ${detail.quote.charge.toFixed(2)} will be issued.`}
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={handleCancel} disabled={actionLoading}>
                {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm cancel
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowCancel(false)}>
                Keep booking
              </Button>
            </div>
          </div>
        )}

        {showClaim && (
          <ClaimForm bookingId={detail.id} pieces={detail.goods.pieces} onDone={onReload} onCancel={() => setShowClaim(false)} />
        )}

        {actionError && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {actionError}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Claim form ──────────────────────────────────────────────────── */

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
    <div className="rounded-md border p-4">
      <h3 className="mb-3 text-sm font-semibold">File a Claim</h3>
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label>Claim type</Label>
          <div className="flex gap-2">
            {(['damage', 'loss'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setClaimType(t)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  claimType === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
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
          <textarea
            id="claimDesc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Describe the damage or loss"
          />
        </div>
        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
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
      </div>
    </div>
  )
}

/* ── Air Waybill ─────────────────────────────────────────────────── */

function AirWaybill({ detail }: { detail: BookingDetail }) {
  function handlePrint() {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AWB ${detail.awbNumber}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; color: #111; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .sub { color: #666; font-size: 0.875rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
  th, td { border: 1px solid #ccc; padding: 0.5rem 0.75rem; text-align: left; font-size: 0.875rem; }
  th { background: #f5f5f5; font-weight: 600; width: 40%; }
  .section { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: #666; margin: 1.25rem 0 0.5rem; letter-spacing: 0.05em; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>Air Waybill ${detail.awbNumber}</h1>
<p class="sub">Booking ${detail.bookingRef}</p>

<p class="section">Shipper</p>
<table>
  <tr><th>Name</th><td>${detail.shipper.name}</td></tr>
  ${detail.shipper.phone ? `<tr><th>Phone</th><td>${detail.shipper.phone}</td></tr>` : ''}
</table>

<p class="section">Consignee</p>
<table>
  <tr><th>Name</th><td>${detail.consignee.name}</td></tr>
  <tr><th>Address</th><td>${detail.consignee.address}</td></tr>
  ${detail.consignee.phone ? `<tr><th>Phone</th><td>${detail.consignee.phone}</td></tr>` : ''}
</table>

<p class="section">Flight</p>
<table>
  <tr><th>Flight</th><td>${detail.flight.flightNumber}</td></tr>
  <tr><th>Route</th><td>${detail.flight.origin} (${detail.flight.originName}) → ${detail.flight.destination} (${detail.flight.destinationName})</td></tr>
  <tr><th>Departure</th><td>${new Date(detail.flight.depAt).toLocaleString()}</td></tr>
  <tr><th>Arrival</th><td>${new Date(detail.flight.arrAt).toLocaleString()}</td></tr>
</table>

<p class="section">Goods</p>
<table>
  <tr><th>Commodity</th><td>${detail.goods.commodityTypeName}</td></tr>
  <tr><th>Pieces</th><td>${detail.goods.pieces}</td></tr>
  <tr><th>Declared weight</th><td>${detail.goods.declaredWeightKg} kg</td></tr>
  <tr><th>Declared volume</th><td>${detail.goods.declaredVolumeM3} m³</td></tr>
  <tr><th>Description</th><td>${detail.goods.goodsDescription}</td></tr>
</table>

<p class="section">Charges</p>
<table>
  <tr><th>Chargeable weight</th><td>${detail.quote.chargeableKg} kg</td></tr>
  <tr><th>Rate per kg</th><td>${detail.quote.currency} ${detail.quote.ratePerKg.toFixed(2)}</td></tr>
  <tr><th>Total charge</th><td>${detail.quote.currency} ${detail.quote.charge.toFixed(2)}</td></tr>
</table>
</body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Air Waybill
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1 h-4 w-4" /> Print
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Dt>AWB Number</Dt>
          <Dd className="font-medium">{detail.awbNumber}</Dd>
          <Dt>Shipper</Dt>
          <Dd>{detail.shipper.name}</Dd>
          <Dt>Consignee</Dt>
          <Dd>{detail.consignee.name}</Dd>
          <Dt>Flight</Dt>
          <Dd>
            {detail.flight.flightNumber} · {detail.flight.origin} → {detail.flight.destination}
          </Dd>
          <Dt>Pieces</Dt>
          <Dd>{detail.goods.pieces}</Dd>
          <Dt>Weight</Dt>
          <Dd>{detail.goods.declaredWeightKg} kg</Dd>
          <Dt>Volume</Dt>
          <Dd>{detail.goods.declaredVolumeM3} m³</Dd>
          <Dt>Chargeable kg</Dt>
          <Dd>{detail.quote.chargeableKg} kg</Dd>
          <Dt>Rate</Dt>
          <Dd>
            {detail.quote.currency} {detail.quote.ratePerKg.toFixed(2)}/kg
          </Dd>
          <Dt>Charge</Dt>
          <Dd className="font-semibold">
            {detail.quote.currency} {detail.quote.charge.toFixed(2)}
          </Dd>
        </dl>
      </CardContent>
    </Card>
  )
}

/* ── Claim card ──────────────────────────────────────────────────── */

function ClaimCard({ claim }: { claim: NonNullable<BookingDetail['claim']> }) {
  const decisionVariant =
    claim.decision?.decision === 'approved' ? 'secondary' : claim.decision?.decision === 'rejected' ? 'destructive' : 'outline'
  const decisionLabel = claim.decision ? (claim.decision.decision === 'approved' ? 'Approved' : 'Rejected') : 'Open'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" /> Claim {claim.claimRef}
          <Badge variant={decisionVariant}>{decisionLabel}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Dt>Type</Dt>
          <Dd className="capitalize">{claim.claimType}</Dd>
          <Dt>Pieces affected</Dt>
          <Dd>{claim.piecesAffected}</Dd>
          <Dt>Claimed amount</Dt>
          <Dd>
            {claim.currency} {claim.claimedAmount.toFixed(2)}
          </Dd>
          <Dt>Filed</Dt>
          <Dd>{new Date(claim.filedAt).toLocaleString()}</Dd>
          <Dt>Description</Dt>
          <Dd className="col-span-full sm:col-span-2">{claim.description}</Dd>
        </dl>
        {claim.decision && (
          <div className="mt-3 border-t pt-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Dt>Decision</Dt>
              <Dd className="capitalize">{claim.decision.decision}</Dd>
              {claim.decision.approvedAmount != null && (
                <>
                  <Dt>Approved amount</Dt>
                  <Dd>
                    {claim.currency} {claim.decision.approvedAmount.toFixed(2)}
                  </Dd>
                </>
              )}
              <Dt>Note</Dt>
              <Dd className="col-span-full sm:col-span-2">{claim.decision.note}</Dd>
              <Dt>Decided</Dt>
              <Dd>{new Date(claim.decision.decidedAt).toLocaleString()}</Dd>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
