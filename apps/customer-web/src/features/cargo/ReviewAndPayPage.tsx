import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { AlertCircle, Loader2, Check } from 'lucide-react'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@customer-web/components/ui/dialog'
import { Separator } from '@customer-web/components/ui/separator'
import { Skeleton } from '@customer-web/components/ui/skeleton'
import { useCustomerCargoApi, CargoApiError, type BookingDetail, type CargoSettings } from './cargo-api'
import CargoHero from './CargoHero'

/* ── Formatting helpers ─────────────────────────────────────────── */

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function fmtDateShort(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

function fmtMoney(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function flightDuration(dep: string, arr: string): string {
  const ms = new Date(arr).getTime() - new Date(dep).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return `${h} h ${m.toString().padStart(2, '0')} m`
}

/* ── Progress steps ─────────────────────────────────────────────── */

function ProgressSteps({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { num: 1, label: 'Ship cargo' },
    { num: 2, label: 'Review and pay' },
    { num: 3, label: 'Confirmed' },
  ]

  return (
    <div className="flex items-center gap-0">
      {steps.map((s, i) => {
        const done = s.num < step
        const active = s.num === step
        const dim = s.num > step

        return (
          <div key={s.num} className="flex items-center">
            {i > 0 && <div className={`h-px w-8 sm:w-12 ${done || active ? 'bg-white/60' : 'bg-white/20'}`} />}
            <div className="flex items-center gap-2">
              {done ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
              ) : (
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    active ? 'bg-white text-[#1e2a5a]' : 'border border-white/30 text-white/40'
                  }`}
                >
                  {s.num}
                </div>
              )}
              <span className={`text-xs sm:text-sm ${dim ? 'text-white/40' : 'font-medium text-white'}`}>{s.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Hold expired dialog ────────────────────────────────────────── */

function SummaryRows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="rounded-lg bg-muted/50 p-4 text-sm">
      {rows.map((r, i) => (
        <div key={r.label}>
          {i > 0 && <Separator className="my-2" />}
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="text-right font-medium">{r.value}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function HoldExpiredDialog({ detail, holdMinutes }: { detail: BookingDetail; holdMinutes: number }) {
  const navigate = useNavigate()
  const goToMyCargo = () => void navigate({ to: '/cargo', search: { tab: 'bookings' } })

  return (
    <Dialog open onOpenChange={(open) => !open && goToMyCargo()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl">⏱</div>
          <DialogTitle>Your hold expired</DialogTitle>
          <DialogDescription>
            Payment was not finished within {holdMinutes} minutes, so your space was released. Nothing was charged.
          </DialogDescription>
        </DialogHeader>

        <SummaryRows
          rows={[
            { label: 'Booking', value: `${detail.bookingRef} · not paid` },
            { label: 'Charged', value: 'Nothing' },
            {
              label: 'Space released',
              value: `${detail.goods.declaredWeightKg} kg on ${detail.flight.flightNumber} · ${fmtDateShort(detail.flight.depAt)}`,
            },
          ]}
        />

        <DialogFooter className="sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={goToMyCargo}>
            Go to My cargo
          </Button>
          <Button className="flex-1" onClick={() => void navigate({ to: '/cargo/ship' })}>
            Book again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Cancel dialog ──────────────────────────────────────────────── */

export function CancelDialog({ detail, onClose, onDone }: { detail: BookingDetail; onClose: () => void; onDone: () => void }) {
  const api = useCustomerCargoApi()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isHeld = detail.status === 'held'

  async function handleCancel() {
    setLoading(true)
    setError('')
    try {
      await api.cancelBooking(detail.id)
      onDone()
    } catch (err) {
      setError(err instanceof CargoApiError ? err.message : 'Cancellation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-xl text-red-600">!</div>
          <DialogTitle>Cancel this booking?</DialogTitle>
          <DialogDescription>
            {isHeld
              ? `Cancelling is free. Nothing has been charged, and the ${detail.goods.declaredWeightKg} kg held on ${detail.flight.flightNumber} · ${fmtDateShort(detail.flight.depAt)} is released.`
              : `Cancelling is free. ${fmtMoney(detail.quote.currency, detail.quote.charge)} is refunded in full, and the ${detail.goods.declaredWeightKg} kg held on ${detail.flight.flightNumber} · ${fmtDateShort(detail.flight.depAt)} is released.`}
          </DialogDescription>
        </DialogHeader>

        <SummaryRows
          rows={[
            { label: 'Booking', value: `${detail.bookingRef}${isHeld ? ' · not paid' : ''}` },
            {
              label: isHeld ? 'Charged' : 'Refund',
              value: isHeld ? 'Nothing' : `${fmtMoney(detail.quote.currency, detail.quote.charge)} (full amount)`,
            },
          ]}
        />

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="sm:flex-row">
          <Button variant="outline" className="flex-1" disabled={loading} onClick={onClose}>
            Keep booking
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
            disabled={loading}
            onClick={() => void handleCancel()}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isHeld ? 'Cancel booking' : 'Cancel and refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Countdown hook ─────────────────────────────────────────────── */

function useCountdown(expiresAt: string) {
  const [remaining, setRemaining] = useState(() => {
    const ms = new Date(expiresAt).getTime() - Date.now()
    return Math.max(0, Math.floor(ms / 1000))
  })
  const ref = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    function tick() {
      const ms = new Date(expiresAt).getTime() - Date.now()
      setRemaining(Math.max(0, Math.floor(ms / 1000)))
    }
    tick()
    ref.current = setInterval(tick, 1000)
    return () => clearInterval(ref.current)
  }, [expiresAt])

  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  const label = `${m}:${s.toString().padStart(2, '0')}`
  return { remaining, label, expired: remaining <= 0 }
}

/* ── Main page ──────────────────────────────────────────────────── */

export default function ReviewAndPayPage() {
  const { id } = useParams({ from: '/_authenticated/cargo/bookings/$id/pay' })
  const api = useCustomerCargoApi()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<BookingDetail | null>(null)
  const [settings, setSettings] = useState<CargoSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  const [showExpired, setShowExpired] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [d, s] = await Promise.all([api.getBookingDetail(id), api.getSettings()])
      setDetail(d)
      setSettings(s)
      if (d.status !== 'held') {
        if (d.status === 'booked' || d.status === 'accepted' || d.status === 'loaded') {
          void navigate({ to: '/cargo/bookings/$id', params: { id } })
          return
        }
        setShowExpired(true)
      }
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

  async function handlePay() {
    if (!detail) return
    setPaying(true)
    setPayError('')
    try {
      const result = await api.mockPay(detail.id)
      if (result.error) {
        if (result.error.code === 'HOLD_EXPIRED') {
          setShowExpired(true)
          return
        }
        setPayError(result.error.message)
        return
      }
      void navigate({ to: '/cargo/bookings/$id', params: { id: detail.id }, search: { confirmed: '1' } })
    } catch (err) {
      if (err instanceof CargoApiError) {
        if (err.code === 'HOLD_EXPIRED') {
          setShowExpired(true)
          return
        }
        setPayError(err.message)
      } else {
        setPayError('Payment failed')
      }
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto grid max-w-6xl gap-4 px-6 py-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error || 'Booking not found'}</AlertDescription>
        </Alert>
        <Button asChild variant="link" className="mt-4 px-0">
          <Link to="/cargo">← Back to My Cargo</Link>
        </Button>
      </div>
    )
  }

  if (showExpired) {
    return <HoldExpiredDialog detail={detail} holdMinutes={settings?.holdMinutes ?? 15} />
  }

  return (
    <div className="text-left">
      <PayPageContent
        detail={detail}
        settings={settings}
        paying={paying}
        payError={payError}
        onPay={handlePay}
        onCancel={() => setShowCancel(true)}
        onExpired={() => setShowExpired(true)}
      />
      {showCancel && (
        <CancelDialog
          detail={detail}
          onClose={() => setShowCancel(false)}
          onDone={() => {
            setShowCancel(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

/* ── Pay page content ───────────────────────────────────────────── */

function PayPageContent({
  detail,
  settings,
  paying,
  payError,
  onPay,
  onCancel,
  onExpired,
}: {
  detail: BookingDetail
  settings: CargoSettings | null
  paying: boolean
  payError: string
  onPay: () => void
  onCancel: () => void
  onExpired: () => void
}) {
  const d = detail
  const f = d.flight
  const q = d.quote
  const g = d.goods
  const countdown = useCountdown(d.holdExpiresAt)

  useEffect(() => {
    if (countdown.expired) onExpired()
  }, [countdown.expired, onExpired])

  const subtitle = `Booking ${d.bookingRef} · ${f.flightNumber} ${f.origin} → ${f.destination} · ${fmtDateShort(f.depAt)}. Check the details, then pay to confirm your space.`

  return (
    <>
      <CargoHero title="Review and pay" subtitle={subtitle} bottom={<ProgressSteps step={2} />} />

      <div className="bg-muted/40 py-8">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* Left column */}
            <div className="space-y-6">
              {/* Hold banner */}
              <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-amber-900">
                  <span className="flex items-start gap-2">
                    <span className="text-lg">⏱</span>
                    <span>
                      <strong>Your space is held</strong> · {g.declaredWeightKg} kg on {f.flightNumber}. Pay before the timer ends or the
                      space is released.
                    </span>
                  </span>
                  <Badge className="bg-amber-900 px-3 py-1 text-sm text-white">{countdown.label} left</Badge>
                </AlertDescription>
              </Alert>

              {/* Your shipment card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Your shipment</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Flight strip */}
                  <Card className="mb-5 py-4 shadow-none">
                    <CardContent className="px-4">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-semibold text-primary">{f.flightNumber}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(f.depAt)}</span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                        {/* Departure */}
                        <div>
                          <div className="text-2xl font-bold">{fmtTime(f.depAt)}</div>
                          <div className="text-sm text-muted-foreground">
                            {f.origin} · {f.originName}
                          </div>
                        </div>
                        {/* Centre */}
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-2">
                            <Separator className="w-8" />
                            <span className="text-sm">✈</span>
                            <Separator className="w-8" />
                          </div>
                          <div className="text-[11px] whitespace-nowrap text-muted-foreground">
                            {flightDuration(f.depAt, f.arrAt)} · direct
                          </div>
                        </div>
                        {/* Arrival */}
                        <div className="text-right">
                          <div className="text-2xl font-bold">{fmtTime(f.arrAt)}</div>
                          <div className="text-sm text-muted-foreground">
                            {f.destination} · {f.destinationName}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Detail grid */}
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <LabelValue label="Booking" value={d.bookingRef} />
                    <LabelValue label="Goods" value={g.goodsDescription} />
                    <LabelValue label="Pieces" value={String(g.pieces)} />
                    <LabelValue label="Weight" value={`${g.declaredWeightKg} kg`} />
                    <LabelValue label="Volume" value={`${g.declaredVolumeM3} m³`} />
                    <LabelValue label="Route" value={`${f.origin} → ${f.destination} · ${q.distanceKm} km`} />
                  </div>
                </CardContent>
              </Card>

              {/* What you are paying for */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">What you are paying for</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Row label="Commodity" value={g.commodityTypeName} />
                  <Row label={`Distance band (${q.distanceKm} km)`} value={`${q.distanceKm} km`} />
                  <Row label="Actual weight" value={`${g.declaredWeightKg} kg`} />
                  <Row
                    label="Volume weight"
                    value={`${q.chargeableKg >= g.declaredWeightKg ? q.chargeableKg : g.declaredVolumeM3 * (settings?.volumetricKgPerM3 ?? 167)} kg`}
                  />
                  <Row label="Chargeable weight" value={`${q.chargeableKg} kg`} bold />
                  <Row label="Rate" value={`${fmtMoney(q.currency, q.ratePerKg)} / kg`} />

                  <Separator />

                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="text-2xl font-bold">{fmtMoney(q.currency, q.charge)}</span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Chargeable weight is the larger of the actual and volume weight, rounded up to 0.5 kg. Minimum charge{' '}
                    {fmtMoney(q.currency, q.minCharge)}. The price is fixed once you book.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Right column */}
            <div>
              <Card className="lg:sticky lg:top-6">
                <CardHeader>
                  <CardTitle className="text-base">Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Freight</span>
                      <span>{fmtMoney(q.currency, q.charge)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Total to pay</span>
                      <span className="font-bold">
                        {fmtMoney(q.currency, q.charge)} {q.currency}
                      </span>
                    </div>
                  </div>

                  <Button className="mb-2 h-11 w-full" disabled={paying} onClick={onPay}>
                    {paying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Pay {fmtMoney(q.currency, q.charge)}
                  </Button>

                  <Button variant="outline" className="mb-3 w-full" onClick={onCancel}>
                    Cancel
                  </Button>

                  {payError && (
                    <Alert variant="destructive" className="mb-3">
                      <AlertCircle />
                      <AlertDescription>{payError}</AlertDescription>
                    </Alert>
                  )}

                  <p className="text-xs text-muted-foreground">
                    🔒 You&apos;re only charged if your space is still held. Free cancellation until your cargo is loaded.
                  </p>
                </CardContent>
              </Card>

              <p className="mt-3 text-center text-xs text-muted-foreground">Test payment: no real money moves.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Small components ───────────────────────────────────────────── */

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? 'font-semibold' : ''}>{value}</span>
    </div>
  )
}
