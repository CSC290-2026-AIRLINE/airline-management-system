import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Bell, Clock, Loader2, Plane, Scale } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { Textarea } from '@staff-web/components/ui/textarea'
import { Route } from '@staff-web/routes/_authenticated/cargo/bookings.$id'
import { useCargoApi, type BookingDetail } from './cargo-api'

const STATUS_COLORS: Record<string, string> = {
  held: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  booked: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  loaded: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  in_transit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  arrived: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rebook_required: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  expired: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground'
  return (
    <Badge variant="outline" className={`border-transparent ${color}`}>
      {status.replace(/_/g, ' ')}
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

export function BookingDetailPage() {
  const { id } = Route.useParams()
  const api = useCargoApi()

  const [detail, setDetail] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await api.getBookingDetail(id)
        if (!cancelled) setDetail(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load booking')
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

  const { header, goods, quote, flight, shipper, consignee, timeline, notices } = detail

  return (
    <>
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">{header.bookingRef}</h1>
        <StatusBadge status={header.currentStatus} />
        {header.awbNumber && <span className="font-mono text-sm text-muted-foreground">AWB {header.awbNumber}</span>}
        <span className="ml-auto text-sm font-semibold">{money(header.quotedCharge, header.currency)}</span>
      </div>

      {header.currentStatus === 'booked' && (
        <AcceptanceActions bookingId={header.id} quotedChargeableKg={quote.chargeableKg} onDone={reload} />
      )}

      {import.meta.env.DEV && <TestToolsCard bookingId={header.id} status={header.currentStatus} onDone={reload} />}

      {/* Cards grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Goods */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Goods</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Commodity">{goods.commodityTypeName}</Field>
            <Field label="Handling class">
              <span className="capitalize">{goods.handlingClass.replace(/_/g, ' ')}</span>
            </Field>
            <Field label="Pieces">{goods.pieces}</Field>
            <Field label="Declared weight">{goods.declaredWeightKg.toFixed(1)} kg</Field>
            <Field label="Declared volume">{goods.declaredVolumeM3.toFixed(3)} m³</Field>
            {goods.unNumber && <Field label="UN number">{goods.unNumber}</Field>}
            <div className="col-span-2">
              <Field label="Description">{goods.goodsDescription}</Field>
            </div>
            {goods.measured && (
              <>
                <div className="col-span-2 border-t pt-2 text-xs font-medium text-muted-foreground">Measured (accepted)</div>
                <Field label="Measured weight">{goods.measured.weightKg?.toFixed(1) ?? '—'} kg</Field>
                <Field label="Measured volume">{goods.measured.volumeM3?.toFixed(3) ?? '—'} m³</Field>
                <Field label="Measured chargeable">{goods.measured.chargeableKg?.toFixed(1) ?? '—'} kg</Field>
              </>
            )}
          </CardContent>
        </Card>

        {/* Quote */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Quote</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Distance">{quote.distanceKm} km</Field>
            <Field label="Chargeable weight">{quote.chargeableKg.toFixed(1)} kg</Field>
            <Field label="Rate per kg">{money(quote.ratePerKg, quote.currency)}/kg</Field>
            <Field label="Min. charge">{money(quote.minCharge, quote.currency)}</Field>
            <Field label="Total charge">{money(quote.charge, quote.currency)}</Field>
          </CardContent>
        </Card>

        {/* Flight */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Flight</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Flight">
              {flight.flightNumber} · {fmtDate(flight.serviceDate)}
            </Field>
            <Field label="Status">
              <span className="capitalize">{flight.status}</span>
            </Field>
            <Field label="Route">
              {flight.origin} → {flight.destination}
            </Field>
            <Field label="Departure">{fmt(flight.depAt)}</Field>
            <Field label="Arrival">{fmt(flight.arrAt)}</Field>
            <Field label="Available cargo">{flight.freeKg.toFixed(0)} kg</Field>
          </CardContent>
        </Card>

        {/* Shipper & Consignee */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Shipper &amp; Consignee</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="col-span-2 text-xs font-medium text-muted-foreground">Shipper</div>
            <Field label="Name">{shipper.name}</Field>
            <Field label="Phone">{shipper.phone ?? '—'}</Field>
            <div className="col-span-2 border-t pt-2 text-xs font-medium text-muted-foreground">Consignee</div>
            <Field label="Name">{consignee.name}</Field>
            <Field label="Phone">{consignee.phone ?? '—'}</Field>
            <div className="col-span-2">
              <Field label="Address">{consignee.address}</Field>
            </div>
          </CardContent>
        </Card>

        {/* Payment */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Payment</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Amount">{money(header.quotedCharge, header.currency)}</Field>
            <Field label="Payment ID">{header.paymentId ?? '—'}</Field>
          </CardContent>
        </Card>
      </div>

      {/* Timeline & Notices */}
      <Tabs defaultValue="timeline" className="flex flex-col gap-4">
        <TabsList variant="line" className="gap-2">
          <TabsTrigger value="timeline" className="px-4 py-2 text-sm font-medium">
            <Clock className="mr-1 size-3.5" />
            Timeline ({timeline.length})
          </TabsTrigger>
          <TabsTrigger value="notices" className="px-4 py-2 text-sm font-medium">
            <Bell className="mr-1 size-3.5" />
            Notices ({notices.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          {timeline.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No events yet.</p>
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
                      {e.measuredWeightKg != null && (
                        <span className="text-muted-foreground">
                          measured {e.measuredWeightKg.toFixed(1)} kg / {e.measuredVolumeM3?.toFixed(3) ?? '?'} m³
                        </span>
                      )}
                      {e.refundId && <span className="text-muted-foreground">refund {e.refundId}</span>}
                    </div>
                    {e.note && <p className="text-xs text-muted-foreground italic">{e.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notices">
          {notices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No notices sent.</p>
          ) : (
            <div className="space-y-3">
              {notices.map((n) => (
                <div key={n.id} className="rounded-md border px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="text-xs text-muted-foreground">{fmt(n.notifiedAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                  {n.readAt && <span className="mt-1 block text-xs text-muted-foreground">Read {fmt(n.readAt)}</span>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}

function BackLink() {
  return (
    <Link
      to="/cargo/bookings"
      search={{ status: 'all' }}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      Back to Cargo Desk
    </Link>
  )
}

function TestToolsCard({ bookingId, status, onDone }: { bookingId: string; status: string; onDone: () => void }) {
  const api = useCargoApi()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const run = async (action: () => Promise<string>) => {
    setBusy(true)
    setMsg(null)
    try {
      setMsg(await action())
      onDone()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const canDepart = ['accepted', 'loaded'].includes(status)
  const canArrive = status === 'in_transit'

  if (!canDepart && !canArrive) return null

  return (
    <Card className="border-dashed border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Test Tools (dev only)</CardTitle>
        <CardDescription className="text-xs">Simulate flight milestones for this booking.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {canDepart && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await api.simulateDeparture(bookingId)
                return `Status → ${r.status}`
              })
            }
          >
            {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Plane className="mr-1 size-3" />}
            Simulate departure
          </Button>
        )}
        {canArrive && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await api.simulateArrival(bookingId)
                return `Status → ${r.status}`
              })
            }
          >
            {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Plane className="mr-1 size-3" />}
            Simulate arrival
          </Button>
        )}
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </CardContent>
    </Card>
  )
}

function computeChargeable(weightKg: number, volumeM3: number, kgPerM3 = 167): number {
  return Math.ceil(Math.max(weightKg, volumeM3 * kgPerM3) * 2) / 2
}

function AcceptanceActions({
  bookingId,
  quotedChargeableKg,
  onDone,
}: {
  bookingId: string
  quotedChargeableKg: number
  onDone: () => void
}) {
  const api = useCargoApi()
  const [open, setOpen] = useState(false)
  const [weight, setWeight] = useState('')
  const [volume, setVolume] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const w = parseFloat(weight) || 0
  const v = parseFloat(volume) || 0
  const measuredChargeable = w > 0 && v > 0 ? computeChargeable(w, v) : 0
  const diffPercent =
    quotedChargeableKg > 0 && measuredChargeable > 0 ? ((measuredChargeable - quotedChargeableKg) / quotedChargeableKg) * 100 : 0
  const aboveTolerance = diffPercent > 10

  const valid = w > 0 && v > 0

  const doAccept = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.acceptBooking(bookingId, { measured_weight_kg: w, measured_volume_m3: v })
      setOpen(false)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const doReject = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.rejectBooking(bookingId, { measured_weight_kg: w, measured_volume_m3: v, reason })
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
      <Button onClick={() => setOpen(true)}>
        <Scale className="mr-1.5 size-4" />
        Weigh and accept
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Weigh and accept / reject</DialogTitle>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mw">Measured weight (kg)</Label>
              <Input id="mw" type="number" step="0.1" min="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mv">Measured volume (m³)</Label>
              <Input id="mv" type="number" step="0.001" min="0.001" value={volume} onChange={(e) => setVolume(e.target.value)} />
            </div>
          </div>

          {valid && (
            <div className="rounded-md border p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Measured chargeable</span>
                <span className="font-medium">{measuredChargeable.toFixed(1)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quoted chargeable</span>
                <span>{quotedChargeableKg.toFixed(1)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Difference</span>
                <span className={aboveTolerance ? 'font-medium text-destructive' : ''}>
                  {diffPercent >= 0 ? '+' : ''}
                  {diffPercent.toFixed(1)}%
                </span>
              </div>
              <p className={`mt-2 text-xs ${aboveTolerance ? 'text-destructive' : 'text-muted-foreground'}`}>
                {aboveTolerance ? `${diffPercent.toFixed(0)}% above the quote: you may reject` : `Within 10%: accept`}
              </p>
            </div>
          )}

          {aboveTolerance && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reject-reason">Rejection reason (required to reject)</Label>
              <Textarea id="reject-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            {aboveTolerance && (
              <Button variant="destructive" size="sm" disabled={busy || !reason.trim()} onClick={doReject}>
                {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                Reject
              </Button>
            )}
            <Button size="sm" disabled={busy || !valid} onClick={doAccept}>
              {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
              Accept
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
