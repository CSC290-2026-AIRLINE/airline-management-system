import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { AlertCircle, Loader2, Check } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
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

function HoldExpiredDialog({ detail, holdMinutes }: { detail: BookingDetail; holdMinutes: number }) {
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl">⏱</div>
        </div>
        <h2 className="mb-2 text-center text-lg font-bold text-slate-900">Your hold expired</h2>
        <p className="mb-4 text-center text-sm text-slate-600">
          Payment was not finished within {holdMinutes} minutes, so your space was released. Nothing was charged.
        </p>

        <div className="mb-5 rounded-lg bg-slate-50 p-4 text-sm">
          <div className="flex justify-between border-b border-slate-200 pb-2">
            <span className="text-slate-500">Booking</span>
            <span className="font-medium text-slate-900">{detail.bookingRef} · not paid</span>
          </div>
          <div className="flex justify-between border-b border-slate-200 py-2">
            <span className="text-slate-500">Charged</span>
            <span className="font-medium text-slate-900">Nothing</span>
          </div>
          <div className="flex justify-between pt-2">
            <span className="text-slate-500">Space released</span>
            <span className="font-medium text-slate-900">
              {detail.goods.declaredWeightKg} kg on {detail.flight.flightNumber} · {fmtDateShort(detail.flight.depAt)}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => void navigate({ to: '/cargo', search: { tab: 'bookings' } })}>
            Go to My cargo
          </Button>
          <Button className="flex-1 bg-[#1e2a5a] text-white hover:bg-[#1e2a5a]/90" onClick={() => void navigate({ to: '/cargo/ship' })}>
            Book again
          </Button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-xl text-red-600">!</div>
        </div>
        <h2 className="mb-2 text-center text-lg font-bold text-slate-900">Cancel this booking?</h2>
        <p className="mb-4 text-center text-sm text-slate-600">
          {isHeld
            ? `Cancelling is free. Nothing has been charged, and the ${detail.goods.declaredWeightKg} kg held on ${detail.flight.flightNumber} · ${fmtDateShort(detail.flight.depAt)} is released.`
            : `Cancelling is free. ${fmtMoney(detail.quote.currency, detail.quote.charge)} is refunded in full, and the ${detail.goods.declaredWeightKg} kg held on ${detail.flight.flightNumber} · ${fmtDateShort(detail.flight.depAt)} is released.`}
        </p>

        <div className="mb-5 rounded-lg bg-slate-50 p-4 text-sm">
          <div className="flex justify-between border-b border-slate-200 pb-2">
            <span className="text-slate-500">Booking</span>
            <span className="font-medium text-slate-900">
              {detail.bookingRef}
              {isHeld ? ' · not paid' : ''}
            </span>
          </div>
          <div className="flex justify-between pt-2">
            <span className="text-slate-500">{isHeld ? 'Charged' : 'Refund'}</span>
            <span className="font-medium text-slate-900">
              {isHeld ? 'Nothing' : `${fmtMoney(detail.quote.currency, detail.quote.charge)} (full amount)`}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 text-sm text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" disabled={loading} onClick={onClose}>
            Keep booking
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
            disabled={loading}
            onClick={() => void handleCancel()}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isHeld ? 'Cancel booking' : 'Cancel and refund'}
          </Button>
        </div>
      </div>
    </div>
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
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-start gap-2 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          {error || 'Booking not found'}
        </div>
        <Link to="/cargo" className="mt-4 inline-block text-sm text-blue-600 underline">
          ← Back to My Cargo
        </Link>
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

      <div className="bg-slate-50 py-8">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* Left column */}
            <div className="space-y-6">
              {/* Hold banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-2 text-sm text-amber-900">
                  <span className="text-lg">⏱</span>
                  <span>
                    <strong>Your space is held</strong> · {g.declaredWeightKg} kg on {f.flightNumber}. Pay before the timer ends or the
                    space is released.
                  </span>
                </div>
                <span className="rounded-full bg-amber-900 px-3 py-1 text-sm font-semibold text-white">{countdown.label} left</span>
              </div>

              {/* Your shipment card */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="mb-4 text-base font-semibold text-slate-900">Your shipment</h2>

                {/* Flight strip */}
                <div className="mb-5 rounded-lg border border-slate-200 p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-semibold text-blue-600">{f.flightNumber}</span>
                    <span className="text-xs text-slate-500">{fmtDate(f.depAt)}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                    {/* Departure */}
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{fmtTime(f.depAt)}</div>
                      <div className="text-sm text-slate-600">
                        {f.origin} · {f.originName}
                      </div>
                    </div>
                    {/* Centre */}
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-2">
                        <div className="h-px w-8 bg-slate-300" />
                        <span className="text-sm">✈</span>
                        <div className="h-px w-8 bg-slate-300" />
                      </div>
                      <div className="whitespace-nowrap text-[11px] text-slate-400">{flightDuration(f.depAt, f.arrAt)} · direct</div>
                    </div>
                    {/* Arrival */}
                    <div className="text-right">
                      <div className="text-2xl font-bold text-slate-900">{fmtTime(f.arrAt)}</div>
                      <div className="text-sm text-slate-600">
                        {f.destination} · {f.destinationName}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detail grid */}
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <LabelValue label="Booking" value={d.bookingRef} />
                  <LabelValue label="Goods" value={g.goodsDescription} />
                  <LabelValue label="Pieces" value={String(g.pieces)} />
                  <LabelValue label="Weight" value={`${g.declaredWeightKg} kg`} />
                  <LabelValue label="Volume" value={`${g.declaredVolumeM3} m³`} />
                  <LabelValue label="Route" value={`${f.origin} → ${f.destination} · ${q.distanceKm} km`} />
                </div>
              </div>

              {/* What you are paying for */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="mb-4 text-base font-semibold text-slate-900">What you are paying for</h2>

                <div className="space-y-3 text-sm">
                  <Row label="Commodity" value={g.commodityTypeName} />
                  <Row label={`Distance band (${q.distanceKm} km)`} value={`${q.distanceKm} km`} />
                  <Row label="Actual weight" value={`${g.declaredWeightKg} kg`} />
                  <Row
                    label="Volume weight"
                    value={`${q.chargeableKg >= g.declaredWeightKg ? q.chargeableKg : g.declaredVolumeM3 * (settings?.volumetricKgPerM3 ?? 167)} kg`}
                  />
                  <Row label="Chargeable weight" value={`${q.chargeableKg} kg`} bold />
                  <Row label="Rate" value={`${fmtMoney(q.currency, q.ratePerKg)} / kg`} />

                  <hr className="border-slate-200" />

                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-slate-600">Total</span>
                    <span className="text-2xl font-bold text-slate-900">{fmtMoney(q.currency, q.charge)}</span>
                  </div>

                  <p className="text-xs text-slate-400">
                    Chargeable weight is the larger of the actual and volume weight, rounded up to 0.5 kg. Minimum charge{' '}
                    {fmtMoney(q.currency, q.minCharge)}. The price is fixed once you book.
                  </p>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 lg:sticky lg:top-6">
                <h2 className="mb-4 text-base font-semibold text-slate-900">Payment</h2>

                <div className="mb-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Freight</span>
                    <span className="text-slate-900">{fmtMoney(q.currency, q.charge)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-900">Total to pay</span>
                    <span className="font-bold text-slate-900">
                      {fmtMoney(q.currency, q.charge)} {q.currency}
                    </span>
                  </div>
                </div>

                <Button className="mb-2 h-11 w-full bg-[#1e2a5a] text-white hover:bg-[#1e2a5a]/90" disabled={paying} onClick={onPay}>
                  {paying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Pay {fmtMoney(q.currency, q.charge)}
                </Button>

                <Button variant="outline" className="mb-3 w-full" onClick={onCancel}>
                  Cancel
                </Button>

                {payError && (
                  <div className="mb-3 flex items-start gap-2 text-sm text-red-600">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {payError}
                  </div>
                )}

                <p className="text-xs text-slate-400">
                  🔒 You&apos;re only charged if your space is still held. Free cancellation until your cargo is loaded.
                </p>
              </div>

              <p className="mt-3 text-center text-xs text-slate-400">Test payment: no real money moves.</p>
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
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium text-slate-900">{value}</div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={bold ? 'font-semibold text-slate-900' : 'text-slate-900'}>{value}</span>
    </div>
  )
}
