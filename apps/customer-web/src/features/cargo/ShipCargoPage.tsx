import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Plane, AlertCircle, Loader2, Check, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { Input } from '@customer-web/components/ui/input'
import { Badge } from '@customer-web/components/ui/badge'
import {
  useCustomerCargoApi,
  CargoApiError,
  type CargoRoute,
  type CommodityType,
  type QuoteResult,
  type ShipDateInfo,
  type RouteFlight,
} from './cargo-api'
import CargoHero from './CargoHero'

/* ── Helpers ───────────────────────────────────────────────────── */

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function durationText(dep: string, arr: string): string {
  const ms = new Date(arr).getTime() - new Date(dep).getTime()
  const totalMin = Math.round(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} min · direct`
  if (m === 0) return `${h} h · direct`
  return `${h} h ${m} min · direct`
}

const selectCls =
  'flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const inputCls =
  'flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/* ── Main component ────────────────────────────────────────────── */

export default function ShipCargoPage() {
  const api = useCustomerCargoApi()
  const navigate = useNavigate()

  const [routes, setRoutes] = useState<CargoRoute[]>([])
  const [commodityTypes, setCommodityTypes] = useState<CommodityType[]>([])
  const [loading, setLoading] = useState(true)
  const [holdMinutes, setHoldMinutes] = useState(15)
  const [requestWindowDays, setRequestWindowDays] = useState(30)

  const [fromAirport, setFromAirport] = useState('')
  const [toAirport, setToAirport] = useState('')
  const [shipDate, setShipDate] = useState('')
  const [commodityTypeId, setCommodityTypeId] = useState('')
  const [pieces, setPieces] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [volumeM3, setVolumeM3] = useState('')
  const [description, setDescription] = useState('')
  const [unNumber, setUnNumber] = useState('')
  const [shipperCompany, setShipperCompany] = useState('')
  const [shipperPhone, setShipperPhone] = useState('')
  const [consigneeName, setConsigneeName] = useState('')
  const [consigneeAddress, setConsigneeAddress] = useState('')
  const [consigneePhone, setConsigneePhone] = useState('')

  const [shipDates, setShipDates] = useState<ShipDateInfo[]>([])
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [dayFlights, setDayFlights] = useState<RouteFlight[]>([])

  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [quoteError, setQuoteError] = useState<{ code: string; message: string } | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, { code: string; message: string }>>({})

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  /* ── Data loading ──────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [r, c, s] = await Promise.all([api.listRoutes(), api.listCommodityTypes(), api.getSettings()])
        if (!cancelled) {
          setRoutes(r)
          setCommodityTypes(c)
          setHoldMinutes(s.holdMinutes)
          setRequestWindowDays(s.requestWindowDays)
        }
      } catch {
        // Ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedRoute = useMemo(() => {
    if (!fromAirport || !toAirport) return null
    return routes.find((r) => r.origin === fromAirport && r.destination === toAirport) ?? null
  }, [routes, fromAirport, toAirport])

  const routeId = selectedRoute?.id ?? ''

  const origins = useMemo(() => {
    const set = new Map<string, string>()
    routes.forEach((r) => set.set(r.origin, r.originName))
    return Array.from(set.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [routes])

  const destinations = useMemo(() => {
    if (!fromAirport) return []
    const set = new Map<string, string>()
    routes.filter((r) => r.origin === fromAirport).forEach((r) => set.set(r.destination, r.destinationName))
    return Array.from(set.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [routes, fromAirport])

  useEffect(() => {
    if (toAirport && !destinations.find(([code]) => code === toAirport)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToAirport('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAirport])

  const selectedCommodity = commodityTypes.find((c) => c.id === commodityTypeId)
  const isDangerous = selectedCommodity?.handlingClass === 'dangerous'

  useEffect(() => {
    if (!routeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShipDates([])
      return
    }
    let cancelled = false
    const w = Number(weightKg) > 0 ? Number(weightKg) : undefined
    api
      .getShipDates(routeId, w)
      .then((r) => {
        if (!cancelled) setShipDates(r.dates)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, weightKg])

  useEffect(() => {
    if (!routeId || !shipDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDayFlights([])
      return
    }
    let cancelled = false
    api
      .getRouteFlights(routeId, shipDate)
      .then((r) => {
        if (!cancelled) setDayFlights(r)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, shipDate])

  const maxDateStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + requestWindowDays)
    return d.toISOString().slice(0, 10)
  }, [requestWindowDays])

  /* ── Quote logic ───────────────────────────────────────────── */

  const canQuote =
    routeId && shipDate && commodityTypeId && Number(pieces) >= 1 && Number(weightKg) > 0 && Number(volumeM3) > 0 && description.trim()

  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchQuote = useCallback(async () => {
    if (!canQuote) {
      setQuote(null)
      setQuoteError(null)
      setFieldErrors({})
      return
    }
    setQuoteLoading(true)
    setQuoteError(null)
    setFieldErrors({})
    try {
      const result = await api.getQuote({
        route_id: routeId,
        ship_date: shipDate,
        commodity_type_id: commodityTypeId,
        pieces: Number(pieces),
        weight_kg: Number(weightKg),
        volume_m3: Number(volumeM3),
        description: description.trim(),
        un_number: isDangerous && unNumber ? unNumber : undefined,
      })
      setQuote(result)
    } catch (err) {
      if (err instanceof CargoApiError) {
        const e = { code: err.code, message: err.message }
        setQuoteError(e)
        if (err.code === 'PROHIBITED_ITEM') setFieldErrors({ description: e })
        else if (err.code === 'WEIGHT_OUT_OF_RANGE') setFieldErrors({ weightKg: e })
        else if (err.code === 'PIECE_TOO_HEAVY') setFieldErrors({ pieces: e, weightKg: e })
        else if (err.code === 'UN_NUMBER_REQUIRED') setFieldErrors({ unNumber: e })
        else if (err.code === 'NO_FLIGHT_AVAILABLE') setFieldErrors({})
        else if (err.code === 'NO_RATE') setFieldErrors({})
      } else {
        setQuoteError({ code: 'ERROR', message: 'Could not get a quote. Please check your inputs.' })
      }
    } finally {
      setQuoteLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, shipDate, commodityTypeId, pieces, weightKg, volumeM3, description, unNumber, isDangerous])

  useEffect(() => {
    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current)
    quoteTimerRef.current = setTimeout(() => {
      void fetchQuote()
    }, 500)
    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current)
    }
  }, [fetchQuote])

  const flightInfoNote = useMemo(() => {
    if (!quote || quoteError || !dayFlights.length) return ''
    const assignedIdx = dayFlights.findIndex((f) => f.id === quote.flightId)
    if (assignedIdx <= 0) return ''
    const skipped = dayFlights.slice(0, assignedIdx)
    const wt = Number(weightKg) || 0
    const tooSmall = skipped.filter((f) => wt > 0 && f.availableKg < wt)
    if (tooSmall.length > 0) {
      const f = tooSmall[0]
      return `Earliest flight with room for your cargo. ${f.flightNumber} at ${formatTime(f.depAt)} has only ${f.availableKg.toLocaleString()} kg free.`
    }
    return ''
  }, [quote, quoteError, dayFlights, weightKg])

  const canSubmit = quote && !quoteError && shipperCompany.trim() && consigneeName.trim() && consigneeAddress.trim() && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const result = await api.createBooking({
        route_id: routeId,
        ship_date: shipDate,
        commodity_type_id: commodityTypeId,
        pieces: Number(pieces),
        weight_kg: Number(weightKg),
        volume_m3: Number(volumeM3),
        description: description.trim(),
        un_number: isDangerous && unNumber ? unNumber : undefined,
        shipper_company: shipperCompany.trim(),
        shipper_phone: shipperPhone.trim() || undefined,
        consignee_name: consigneeName.trim(),
        consignee_address: consigneeAddress.trim(),
        consignee_phone: consigneePhone.trim() || undefined,
      })
      void navigate({ to: '/cargo/bookings/$id', params: { id: result.id } })
    } catch (err) {
      setSubmitError(err instanceof CargoApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const daysWithRoom = useMemo(() => {
    const wt = Number(weightKg) || 0
    return shipDates.filter((d) => d.hasOpenFlight && d.maxAvailableKg >= wt).slice(0, 5)
  }, [shipDates, weightKg])

  /* ── Render ────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="text-left">
        <CargoHero subtitle="Loading…" />
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      </div>
    )
  }

  const subtitle = `Tell us the route and the day you want to ship. We put your cargo on the earliest flight that day with room, and hold the weight for ${holdMinutes} minutes while you pay.`

  return (
    <div className="text-left">
      <CargoHero subtitle={subtitle} />

      <div className="bg-slate-50 py-8">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            {/* ── Left column ──────────────────────────────────── */}
            <div>
              {/* Section 1 */}
              <div className="border-t border-slate-200 pt-6">
                <h2 className="mb-4 text-base font-semibold text-slate-900">1. Route and ship date</h2>

                <div className="grid gap-4">
                  {/* From / To */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="from" className="mb-1 block text-xs text-slate-600">
                        From
                      </label>
                      <select id="from" value={fromAirport} onChange={(e) => setFromAirport(e.target.value)} className={selectCls}>
                        <option value="">Select origin</option>
                        {origins.map(([code, name]) => (
                          <option key={code} value={code}>
                            {name} ({code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="to" className="mb-1 block text-xs text-slate-600">
                        To
                      </label>
                      <select
                        id="to"
                        value={toAirport}
                        onChange={(e) => setToAirport(e.target.value)}
                        disabled={!fromAirport}
                        className={selectCls}
                      >
                        <option value="">Select destination</option>
                        {destinations.map(([code, name]) => (
                          <option key={code} value={code}>
                            {name} ({code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Ship date */}
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">Ship date</label>
                    {shipDate ? (
                      (() => {
                        const di = shipDates.find((d) => d.date === shipDate)
                        const freeKg = di?.maxAvailableKg ?? 0
                        const wt = Number(weightKg) || 0
                        return (
                          <>
                            <p className="text-sm font-medium text-slate-900">
                              {freeKg.toLocaleString()} kg free on {formatDateShort(shipDate)}
                            </p>
                            {wt <= 0 && <p className="text-xs text-slate-500">Enter the weight to check it fits.</p>}
                            {wt > 0 && wt <= freeKg && <p className="text-xs text-emerald-600">✓ Room for your {wt.toLocaleString()} kg</p>}
                            {wt > 0 && wt > freeKg && (
                              <p className="text-xs text-red-600">Not enough room for {wt.toLocaleString()} kg. Pick another day.</p>
                            )}
                          </>
                        )
                      })()
                    ) : (
                      <p className="text-xs text-slate-500">
                        Pick a day up to {requestWindowDays} days ahead (to {formatDate(maxDateStr)}). Your cargo goes on the earliest
                        flight that day with room.
                      </p>
                    )}
                  </div>

                  {/* Calendar picker */}
                  {routeId && shipDates.length > 0 && (
                    <ShipCalendar
                      dates={shipDates}
                      value={shipDate}
                      onChange={setShipDate}
                      calMonth={calMonth}
                      onCalMonthChange={setCalMonth}
                      weightKg={Number(weightKg) || 0}
                    />
                  )}

                  {/* Flights on day */}
                  {shipDate && dayFlights.length > 0 && (
                    <div className="grid gap-2">
                      <h3 className="text-xs font-semibold text-slate-900">Flights on {formatDate(shipDate)}</h3>
                      {quote && !quoteError && (
                        <div className="flex items-start gap-2 rounded-md bg-blue-50 p-2.5 text-xs text-blue-700">
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          We put your cargo on the earliest flight with room. You don&apos;t need to choose.
                        </div>
                      )}
                      {(quoteError || (!quote && canQuote && !quoteLoading)) && (
                        <p className="text-xs text-slate-500">A flight is assigned once your goods pass the checks.</p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {dayFlights.map((f) => {
                          const wt = Number(weightKg) || 0
                          const isAssigned = !quoteError && quote?.flightId === f.id
                          const notEnough = wt > 0 && f.availableKg < wt
                          return (
                            <div
                              key={f.id}
                              className={`rounded-lg border p-3 text-sm ${isAssigned ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-900">{f.flightNumber}</span>
                                {isAssigned && (
                                  <Badge variant="default" className="gap-1 text-xs">
                                    <Check className="h-3 w-3" /> Your flight
                                  </Badge>
                                )}
                                {!isAssigned && !notEnough && <span className="text-xs text-slate-500">Later flight</span>}
                                {!isAssigned && notEnough && <span className="text-xs text-red-600">Not enough room</span>}
                              </div>
                              <p className="mt-1 text-slate-600">
                                {formatTime(f.depAt)} {f.origin} → {formatTime(f.arrAt)} {f.destination}
                              </p>
                              <p className="text-xs text-slate-500">{f.availableKg.toLocaleString()} kg free</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2 */}
              <div className="mt-6 border-t border-slate-200 pt-6">
                <h2 className="mb-4 text-base font-semibold text-slate-900">2. Describe the goods</h2>

                <div className="grid gap-4">
                  {/* Commodity | Pieces | Weight | Volume */}
                  <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                    <div>
                      <label htmlFor="commodityType" className="mb-1 block text-xs text-slate-600">
                        Commodity type
                      </label>
                      <select
                        id="commodityType"
                        value={commodityTypeId}
                        onChange={(e) => setCommodityTypeId(e.target.value)}
                        className={selectCls}
                      >
                        <option value="">Select</option>
                        {commodityTypes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.handlingClass})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="pieces" className="mb-1 block text-xs text-slate-600">
                        Pieces
                      </label>
                      <Input
                        id="pieces"
                        type="number"
                        min="1"
                        value={pieces}
                        onChange={(e) => setPieces(e.target.value)}
                        className={`h-10 bg-white ${fieldErrors.pieces ? 'border-red-500' : 'border-slate-300'}`}
                      />
                      {fieldErrors.pieces && <FieldError error={fieldErrors.pieces} />}
                    </div>
                    <div>
                      <label htmlFor="weight" className="mb-1 block text-xs text-slate-600">
                        Weight (kg)
                      </label>
                      <Input
                        id="weight"
                        type="number"
                        min="0"
                        step="0.1"
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value)}
                        className={`h-10 bg-white ${fieldErrors.weightKg ? 'border-red-500' : 'border-slate-300'}`}
                      />
                      {fieldErrors.weightKg && <FieldError error={fieldErrors.weightKg} />}
                    </div>
                    <div>
                      <label htmlFor="volume" className="mb-1 block text-xs text-slate-600">
                        Volume (m³)
                      </label>
                      <Input
                        id="volume"
                        type="number"
                        min="0"
                        step="0.001"
                        value={volumeM3}
                        onChange={(e) => setVolumeM3(e.target.value)}
                        className="h-10 border-slate-300 bg-white"
                      />
                    </div>
                  </div>

                  {/* Goods description — single-line input */}
                  <div>
                    <label htmlFor="description" className="mb-1 block text-xs text-slate-600">
                      Goods description
                    </label>
                    <input
                      id="description"
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the goods being shipped"
                      className={`${inputCls} ${fieldErrors.description ? '!border-red-500' : ''}`}
                    />
                    {fieldErrors.description && <FieldError error={fieldErrors.description} />}
                  </div>

                  {/* Error banner for other quote errors */}
                  {quoteError &&
                    !fieldErrors.description &&
                    quoteError.code !== 'NO_FLIGHT_AVAILABLE' &&
                    quoteError.code !== 'NO_RATE' &&
                    quoteError.code !== 'UN_NUMBER_REQUIRED' && <FieldError error={quoteError} />}

                  {/* UN number (dangerous goods only) */}
                  {isDangerous && (
                    <div>
                      <label htmlFor="unNumber" className="mb-1 block text-xs text-slate-600">
                        UN number
                      </label>
                      <input
                        id="unNumber"
                        type="text"
                        placeholder="UNxxxx"
                        value={unNumber}
                        onChange={(e) => setUnNumber(e.target.value)}
                        maxLength={6}
                        className={`${inputCls} ${fieldErrors.unNumber ? '!border-red-500' : ''}`}
                      />
                      <p className="mt-1 text-xs text-slate-500">Needed for dangerous goods: UN and four digits.</p>
                      <FieldError error={fieldErrors.unNumber} />
                    </div>
                  )}

                  {/* Shipper / Consignee */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="shipperCompany" className="mb-1 block text-xs text-slate-600">
                        Shipper
                      </label>
                      <Input
                        id="shipperCompany"
                        placeholder="Company"
                        value={shipperCompany}
                        onChange={(e) => setShipperCompany(e.target.value)}
                        className="h-10 border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="consigneeName" className="mb-1 block text-xs text-slate-600">
                        Consignee
                      </label>
                      <Input
                        id="consigneeName"
                        placeholder="Name"
                        value={consigneeName}
                        onChange={(e) => setConsigneeName(e.target.value)}
                        className="h-10 border-slate-300 bg-white"
                      />
                    </div>
                  </div>

                  {/* Shipper phone / Consignee phone */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="shipperPhone" className="mb-1 block text-xs text-slate-600">
                        Shipper phone
                      </label>
                      <Input
                        id="shipperPhone"
                        placeholder="Optional"
                        value={shipperPhone}
                        onChange={(e) => setShipperPhone(e.target.value)}
                        className="h-10 border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="consigneePhone" className="mb-1 block text-xs text-slate-600">
                        Consignee phone
                      </label>
                      <Input
                        id="consigneePhone"
                        placeholder="Optional"
                        value={consigneePhone}
                        onChange={(e) => setConsigneePhone(e.target.value)}
                        className="h-10 border-slate-300 bg-white"
                      />
                    </div>
                  </div>

                  {/* Consignee address (full-width, API needs it separately) */}
                  <div>
                    <label htmlFor="consigneeAddress" className="mb-1 block text-xs text-slate-600">
                      Consignee address
                    </label>
                    <Input
                      id="consigneeAddress"
                      placeholder="Address"
                      value={consigneeAddress}
                      onChange={(e) => setConsigneeAddress(e.target.value)}
                      className="h-10 border-slate-300 bg-white"
                    />
                  </div>

                  {submitError && (
                    <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      {submitError}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Right column ─────────────────────────────────── */}
            <div className="grid content-start gap-4 lg:sticky lg:top-6 lg:self-start">
              <FlightCard
                quote={quote}
                quoteError={quoteError}
                quoteLoading={quoteLoading}
                canQuote={!!canQuote}
                daysWithRoom={daysWithRoom}
                onPickDate={setShipDate}
                weightKg={Number(weightKg) || 0}
                infoNote={flightInfoNote}
              />

              <QuoteCard
                quote={quote}
                quoteError={quoteError}
                quoteLoading={quoteLoading}
                canSubmit={!!canSubmit}
                submitting={submitting}
                volumeM3={volumeM3}
                onSubmit={handleSubmit}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Subcomponents ─────────────────────────────────────────────── */

function QRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm ${bold ? 'font-semibold text-slate-900' : 'font-semibold text-slate-700'}`}>{value}</span>
    </div>
  )
}

function FieldError({ error }: { error?: { code: string; message: string } }) {
  if (!error) return null
  return (
    <div className="flex items-start gap-2 rounded-md bg-red-50 p-2.5 text-xs text-red-700">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <strong>{error.code}</strong> · {error.message}
      </span>
    </div>
  )
}

function FlightCard({
  quote,
  quoteError,
  quoteLoading,
  canQuote,
  daysWithRoom,
  onPickDate,
  weightKg,
  infoNote,
}: {
  quote: QuoteResult | null
  quoteError: { code: string; message: string } | null
  quoteLoading: boolean
  canQuote: boolean
  daysWithRoom: ShipDateInfo[]
  onPickDate: (d: string) => void
  weightKg: number
  infoNote: string
}) {
  if (quote && !quoteLoading && !quoteError) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Your flight</h3>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-3 text-sm">
            <span className="font-semibold text-blue-700">{quote.flightNumber}</span>{' '}
            <span className="text-slate-500">{formatDate(quote.depAt.slice(0, 10))}</span>
          </p>
          <div className="flex items-center justify-between">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{formatTime(quote.depAt)}</p>
              <p className="text-xs text-slate-500">
                {quote.origin} · {quote.originName}
              </p>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <Plane className="h-4 w-4 text-slate-400" />
              <span className="text-xs text-slate-500">{durationText(quote.depAt, quote.arrAt)}</span>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{formatTime(quote.arrAt)}</p>
              <p className="text-xs text-slate-500">
                {quote.destination} · {quote.destinationName}
              </p>
            </div>
          </div>
          <hr className="my-2 border-slate-200" />
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-slate-500">Aircraft</p>
              <p className="font-medium text-slate-700">{quote.aircraft || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500">Room before you</p>
              <p className="font-medium text-slate-700">{quote.availableKg.toLocaleString()} kg</p>
            </div>
            <div>
              <p className="text-slate-500">Distance</p>
              <p className="font-medium text-slate-700">{quote.distanceKm.toLocaleString()} km</p>
            </div>
          </div>
          {infoNote && (
            <div className="mt-2 flex items-start gap-2 rounded-md bg-blue-50 p-2.5 text-xs text-blue-700">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {infoNote}
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">Cargo space can still change until your cargo is loaded.</p>
      </div>
    )
  }

  if (quoteError?.code === 'NO_FLIGHT_AVAILABLE') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-lg font-semibold text-slate-900">No flight available</h3>
        <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>NO_FLIGHT_AVAILABLE</strong> · {quoteError.message}
          </span>
        </div>
        {daysWithRoom.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-xs font-medium text-slate-500">Days with room for {weightKg.toLocaleString()} kg</p>
            <div className="flex flex-wrap gap-1.5">
              {daysWithRoom.map((d) => (
                <button
                  key={d.date}
                  onClick={() => onPickDate(d.date)}
                  className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200"
                >
                  {new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-3 text-lg font-semibold text-slate-900">Assigned flight</h3>
      <div className="rounded-lg border border-slate-200 p-4">
        <p className="font-semibold text-slate-900">No flight assigned</p>
        <p className="mt-1 text-sm text-slate-500">
          {canQuote && quoteLoading ? 'Checking…' : 'No flight is assigned until the checks pass.'}
        </p>
      </div>
    </div>
  )
}

function QuoteCard({
  quote,
  quoteError,
  quoteLoading,
  canSubmit,
  submitting,
  volumeM3,
  onSubmit,
}: {
  quote: QuoteResult | null
  quoteError: { code: string; message: string } | null
  quoteLoading: boolean
  canSubmit: boolean
  submitting: boolean
  volumeM3: string
  onSubmit: () => void
}) {
  const hasQuoteValues = quote != null
  const commodityBand = hasQuoteValues ? `${quote.commodityName}, ${quote.bandLabel}` : '—'
  const rateLabel = hasQuoteValues ? `${quote.ratePerKg.toFixed(2)} / kg` : '—'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-3 text-lg font-semibold text-slate-900">Quote</h3>

      {quoteLoading && (
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculating…
        </div>
      )}

      <div className="grid gap-2">
        <QRow label="Actual weight" value={hasQuoteValues ? `${quote.actualWeightKg.toFixed(1)} kg` : '—'} />
        <QRow
          label={`Volumetric (${Number(volumeM3) || 0} × ${quote?.volumetricKgPerM3 ?? 167})`}
          value={hasQuoteValues ? `${quote.volumetricKg.toFixed(1)} kg` : '—'}
        />
        <QRow label="Chargeable weight" value={hasQuoteValues ? `${quote.chargeableKg.toFixed(1)} kg` : '—'} bold />
        <QRow label={commodityBand} value={rateLabel} />
        <hr className="border-slate-200" />
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-500">Total due</span>
          <span className="text-3xl font-bold text-slate-900">{hasQuoteValues ? `${quote.currency} ${quote.charge.toFixed(2)}` : '—'}</span>
        </div>
        <p className="text-xs text-slate-500">Minimum charge USD 50. Cancel for free any time before it is loaded. Full refund.</p>

        {quoteError && quoteError.code === 'NO_FLIGHT_AVAILABLE' && (
          <p className="text-xs text-red-600">No flight available on the selected date.</p>
        )}

        <Button
          className="mt-2 h-11 w-full rounded-md bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
          onClick={onSubmit}
          disabled={!canSubmit}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Book and pay
        </Button>
      </div>
    </div>
  )
}

/* ── Ship date calendar ────────────────────────────────────────── */

function ShipCalendar({
  dates,
  value,
  onChange,
  calMonth,
  onCalMonthChange,
  weightKg,
}: {
  dates: ShipDateInfo[]
  value: string
  onChange: (d: string) => void
  calMonth: { year: number; month: number }
  onCalMonthChange: (m: { year: number; month: number }) => void
  weightKg: number
}) {
  const dateMap = useMemo(() => new Map(dates.map((d) => [d.date, d])), [dates])
  const validRange = useMemo(() => {
    if (dates.length === 0) return { min: '', max: '' }
    return { min: dates[0].date, max: dates[dates.length - 1].date }
  }, [dates])

  const { year, month } = calMonth
  const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prevMonth = () => {
    const d = new Date(year, month - 1)
    onCalMonthChange({ year: d.getFullYear(), month: d.getMonth() })
  }
  const nextMonth = () => {
    const d = new Date(year, month + 1)
    onCalMonthChange({ year: d.getFullYear(), month: d.getMonth() })
  }

  const cells: (null | { day: number; dateStr: string; info: ShipDateInfo | undefined })[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, dateStr, info: dateMap.get(dateStr) })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button onClick={prevMonth} className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-slate-900">{monthName}</span>
        <button onClick={nextMonth} className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day grid */}
      <div className="px-4 pb-3 pt-2">
        <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
            <div key={d} className="py-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {d}
            </div>
          ))}
          {cells.map((cell, i) => {
            if (!cell) return <div key={`e-${i}`} />
            const { day, dateStr, info } = cell
            const inRange = dateStr >= validRange.min && dateStr <= validRange.max
            const isSelected = dateStr === value
            const noRoom = inRange && info?.hasOpenFlight && weightKg > 0 && info.maxAvailableKg < weightKg
            const disabled = !inRange || !info?.hasOpenFlight || noRoom

            const tooltip = inRange && info?.hasOpenFlight && !noRoom ? `Up to ${info.maxAvailableKg.toLocaleString()} kg free` : undefined

            return (
              <button
                key={dateStr}
                onClick={() => !disabled && onChange(dateStr)}
                disabled={disabled}
                title={tooltip}
                className={`flex flex-col items-center rounded-md py-1.5 text-xs transition-colors ${
                  isSelected
                    ? 'bg-blue-700 font-semibold text-white shadow-sm'
                    : disabled
                      ? 'cursor-default text-slate-300'
                      : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{day}</span>
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <p className="mt-2 px-1 text-[10px] text-slate-500">Grey days have no flight, or not enough room for your weight.</p>
      </div>
    </div>
  )
}
