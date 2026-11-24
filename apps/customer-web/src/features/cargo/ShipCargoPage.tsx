import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Plane, AlertCircle, Loader2, Check, Info } from 'lucide-react'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Calendar } from '@customer-web/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import { Field } from '@customer-web/components/ui/field'
import { Input } from '@customer-web/components/ui/input'
import { Separator } from '@customer-web/components/ui/separator'
import { Skeleton } from '@customer-web/components/ui/skeleton'
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

function Req() {
  return <span className="ml-0.5 text-destructive">*</span>
}

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
  const [flaggedField, setFlaggedField] = useState('')

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

  // The last bookable day. Once a route is picked, the backend's calendar is the authority (it counts in the origin airport's local
  // dates); before that, count from the browser's local date. toISOString() here would give the UTC date, a day early in Bangkok
  // before 07:00.
  const maxDateStr = useMemo(() => {
    const last = shipDates[shipDates.length - 1]?.date
    if (last) return last
    const d = new Date()
    d.setDate(d.getDate() + requestWindowDays)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [requestWindowDays, shipDates])

  /* ── Quote logic ───────────────────────────────────────────── */

  const canQuote =
    routeId && shipDate && commodityTypeId && Number(pieces) >= 1 && Number(weightKg) > 0 && Number(volumeM3) > 0 && description.trim()

  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [quotedKey, setQuotedKey] = useState('')

  const fetchQuote = useCallback(async () => {
    if (!canQuote) {
      setQuote(null)
      setQuoteError(null)
      setFieldErrors({})
      setQuotedKey('')
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
      setQuotedKey(
        `${routeId}|${shipDate}|${commodityTypeId}|${pieces}|${weightKg}|${volumeM3}|${description}|${isDangerous ? unNumber : ''}`,
      )
    } catch (err) {
      setQuote(null)
      setQuotedKey('')
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

  const quoteInputKey = `${routeId}|${shipDate}|${commodityTypeId}|${pieces}|${weightKg}|${volumeM3}|${description}|${isDangerous ? unNumber : ''}`
  const isQuoteStale = quote !== null && quotedKey !== quoteInputKey

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

  /* ── Submit readiness ──────────────────────────────────────── */

  const missingFields = useMemo(() => {
    const missing: { label: string; id: string }[] = []
    if (!fromAirport) missing.push({ label: 'Origin', id: 'from' })
    if (!toAirport) missing.push({ label: 'Destination', id: 'to' })
    if (!shipDate) missing.push({ label: 'Ship date', id: 'shipDateSection' })
    if (!commodityTypeId) missing.push({ label: 'Commodity type', id: 'commodityType' })
    if (!pieces || Number(pieces) < 1) missing.push({ label: 'Pieces', id: 'pieces' })
    if (!weightKg || Number(weightKg) <= 0) missing.push({ label: 'Weight', id: 'weight' })
    if (!volumeM3 || Number(volumeM3) <= 0) missing.push({ label: 'Volume', id: 'volume' })
    if (!description.trim()) missing.push({ label: 'Goods description', id: 'description' })
    if (isDangerous && !unNumber.trim()) missing.push({ label: 'UN number', id: 'unNumber' })
    if (!shipperCompany.trim()) missing.push({ label: 'Shipper', id: 'shipperCompany' })
    if (!consigneeName.trim()) missing.push({ label: 'Consignee name', id: 'consigneeName' })
    if (!consigneeAddress.trim()) missing.push({ label: 'Consignee address', id: 'consigneeAddress' })
    return missing
  }, [
    fromAirport,
    toAirport,
    shipDate,
    commodityTypeId,
    pieces,
    weightKg,
    volumeM3,
    description,
    isDangerous,
    unNumber,
    shipperCompany,
    consigneeName,
    consigneeAddress,
  ])

  const disabledReason = useMemo(() => {
    if (submitting) return null
    if (missingFields.length > 0) return `Fill in: ${missingFields.map((f) => f.label).join(', ')}`
    if (quoteError) {
      if (quoteError.code === 'NO_FLIGHT_AVAILABLE') return 'No flight has room on this day'
      return 'Fix the error in the goods section'
    }
    if (!quote || quoteLoading || isQuoteStale) return 'Waiting for quote…'
    return null
  }, [submitting, missingFields, quoteError, quote, quoteLoading, isQuoteStale])

  const canSubmit = !submitting && disabledReason === null

  async function handleSubmit() {
    if (!canSubmit || !quote) return
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
      void navigate({ to: '/cargo/bookings/$id/pay', params: { id: result.id } })
    } catch (err) {
      setSubmitError(err instanceof CargoApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleDisabledClick() {
    if (missingFields.length === 0) return
    const first = missingFields[0]
    setFlaggedField(first.id)
    const el = document.getElementById(first.id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT') el.focus()
    }
  }

  useEffect(() => {
    if (flaggedField) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFlaggedField('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fromAirport,
    toAirport,
    shipDate,
    commodityTypeId,
    pieces,
    weightKg,
    volumeM3,
    description,
    unNumber,
    shipperCompany,
    consigneeName,
    consigneeAddress,
  ])

  const daysWithRoom = useMemo(() => {
    const wt = Number(weightKg) || 0
    return shipDates.filter((d) => d.hasOpenFlight && d.maxAvailableKg >= wt).slice(0, 5)
  }, [shipDates, weightKg])

  /* ── Render ────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="text-left">
        <CargoHero subtitle="Loading…" />
        <div className="mx-auto grid w-full max-w-6xl gap-3 px-6 py-8">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-40 w-full" />
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
              <section>
                <Separator className="mb-6" />
                <h2 className="mb-4 text-base font-semibold">1. Route and ship date</h2>

                <div className="grid gap-4">
                  {/* From / To */}
                  <div className="grid grid-cols-2 gap-4">
                    <Field
                      id="from"
                      label={
                        <>
                          From
                          <Req />
                        </>
                      }
                    >
                      <Select value={fromAirport} onValueChange={setFromAirport}>
                        <SelectTrigger id="from" aria-invalid={flaggedField === 'from'}>
                          <SelectValue placeholder="Select origin">
                            {!fromAirport ? <span className="text-muted-foreground">Select origin</span> : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {origins.map(([code, name]) => (
                            <SelectItem key={code} value={code}>
                              {name} ({code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field
                      id="to"
                      label={
                        <>
                          To
                          <Req />
                        </>
                      }
                    >
                      <Select value={toAirport} onValueChange={setToAirport} disabled={!fromAirport}>
                        <SelectTrigger id="to" aria-invalid={flaggedField === 'to'}>
                          <SelectValue placeholder="Select destination">
                            {!toAirport ? <span className="text-muted-foreground">Select destination</span> : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {destinations.map(([code, name]) => (
                            <SelectItem key={code} value={code}>
                              {name} ({code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  {/* Ship date */}
                  <div id="shipDateSection" className="grid gap-1">
                    <span className="text-sm leading-none font-medium">
                      Ship date
                      <Req />
                    </span>
                    {shipDate ? (
                      (() => {
                        const di = shipDates.find((d) => d.date === shipDate)
                        const freeKg = di?.maxAvailableKg ?? 0
                        const wt = Number(weightKg) || 0
                        return (
                          <>
                            <p className="text-sm font-medium">
                              {freeKg.toLocaleString()} kg free on {formatDateShort(shipDate)}
                            </p>
                            {wt <= 0 && <p className="text-xs text-muted-foreground">Enter the weight to check it fits.</p>}
                            {wt > 0 && wt <= freeKg && <p className="text-xs text-emerald-600">✓ Room for your {wt.toLocaleString()} kg</p>}
                            {wt > 0 && wt > freeKg && (
                              <p className="text-xs text-destructive">Not enough room for {wt.toLocaleString()} kg. Pick another day.</p>
                            )}
                          </>
                        )
                      })()
                    ) : (
                      <p className="text-xs text-muted-foreground">
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
                      flagged={flaggedField === 'shipDateSection'}
                    />
                  )}

                  {/* Flights on day */}
                  {shipDate && dayFlights.length > 0 && (
                    <div className="grid gap-2">
                      <h3 className="text-xs font-semibold">Flights on {formatDate(shipDate)}</h3>
                      {quote && !quoteError && (
                        <Alert>
                          <Info />
                          <AlertDescription>
                            We put your cargo on the earliest flight with room. You don&apos;t need to choose.
                          </AlertDescription>
                        </Alert>
                      )}
                      {(quoteError || (!quote && canQuote && !quoteLoading)) && (
                        <p className="text-xs text-muted-foreground">A flight is assigned once your goods pass the checks.</p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {dayFlights.map((f) => {
                          const wt = Number(weightKg) || 0
                          const isAssigned = !quoteError && quote?.flightId === f.id
                          const notEnough = wt > 0 && f.availableKg < wt
                          // "Later" only means something once a flight is assigned: before that, no flight is earlier or later than ours.
                          const assigned = !quoteError ? dayFlights.find((d) => d.id === quote?.flightId) : undefined
                          const isLater = assigned != null && new Date(f.depAt) > new Date(assigned.depAt)
                          return (
                            <Card key={f.id} className={`gap-1 py-3 text-sm ${isAssigned ? 'border-blue-600 bg-blue-50' : ''}`}>
                              <CardContent className="grid gap-1 px-3">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold">{f.flightNumber}</span>
                                  {isAssigned && (
                                    <Badge className="gap-1 text-xs">
                                      <Check className="h-3 w-3" /> Your flight
                                    </Badge>
                                  )}
                                  {!isAssigned && !notEnough && isLater && (
                                    <span className="text-xs text-muted-foreground">Later flight</span>
                                  )}
                                  {!isAssigned && notEnough && <span className="text-xs text-destructive">Not enough room</span>}
                                </div>
                                <p className="text-muted-foreground">
                                  {formatTime(f.depAt)} {f.origin} → {formatTime(f.arrAt)} {f.destination}
                                </p>
                                <p className="text-xs text-muted-foreground">{f.availableKg.toLocaleString()} kg free</p>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Section 2 */}
              <section className="mt-6">
                <Separator className="mb-6" />
                <h2 className="mb-4 text-base font-semibold">2. Describe the goods</h2>

                <div className="grid gap-4">
                  {/* Commodity | Pieces | Weight | Volume */}
                  <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                    <Field
                      id="commodityType"
                      label={
                        <>
                          Commodity type
                          <Req />
                        </>
                      }
                    >
                      <Select value={commodityTypeId} onValueChange={setCommodityTypeId}>
                        <SelectTrigger id="commodityType" aria-invalid={flaggedField === 'commodityType'}>
                          <SelectValue placeholder="Select">
                            {!commodityTypeId ? <span className="text-muted-foreground">Select</span> : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {commodityTypes.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} ({c.handlingClass})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field
                      id="pieces"
                      error={fieldErrors.pieces?.message}
                      label={
                        <>
                          Pieces
                          <Req />
                        </>
                      }
                    >
                      <Input
                        id="pieces"
                        type="number"
                        min="1"
                        value={pieces}
                        onChange={(e) => setPieces(e.target.value)}
                        aria-invalid={!!fieldErrors.pieces || flaggedField === 'pieces'}
                      />
                    </Field>
                    <Field
                      id="weight"
                      error={fieldErrors.weightKg?.message}
                      label={
                        <>
                          Weight (kg)
                          <Req />
                        </>
                      }
                    >
                      <Input
                        id="weight"
                        type="number"
                        min="0"
                        step="0.1"
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value)}
                        aria-invalid={!!fieldErrors.weightKg || flaggedField === 'weight'}
                      />
                    </Field>
                    <Field
                      id="volume"
                      label={
                        <>
                          Volume (m³)
                          <Req />
                        </>
                      }
                    >
                      <Input
                        id="volume"
                        type="number"
                        min="0"
                        step="0.001"
                        value={volumeM3}
                        onChange={(e) => setVolumeM3(e.target.value)}
                        aria-invalid={flaggedField === 'volume'}
                      />
                    </Field>
                  </div>

                  {/* Goods description — single-line input */}
                  <Field
                    id="description"
                    label={
                      <>
                        Goods description
                        <Req />
                      </>
                    }
                  >
                    <Input
                      id="description"
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the goods being shipped"
                      aria-invalid={!!fieldErrors.description || flaggedField === 'description'}
                    />
                    {fieldErrors.description && <FieldError error={fieldErrors.description} />}
                  </Field>

                  {/* Error banner for other quote errors */}
                  {quoteError &&
                    !fieldErrors.description &&
                    quoteError.code !== 'NO_FLIGHT_AVAILABLE' &&
                    quoteError.code !== 'NO_RATE' &&
                    quoteError.code !== 'UN_NUMBER_REQUIRED' && <FieldError error={quoteError} />}

                  {/* UN number (dangerous goods only) */}
                  {isDangerous && (
                    <Field
                      id="unNumber"
                      label={
                        <>
                          UN number
                          <Req />
                        </>
                      }
                      hint="Needed for dangerous goods: UN and four digits."
                    >
                      <Input
                        id="unNumber"
                        type="text"
                        placeholder="UNxxxx"
                        value={unNumber}
                        onChange={(e) => setUnNumber(e.target.value)}
                        maxLength={6}
                        aria-invalid={!!fieldErrors.unNumber || flaggedField === 'unNumber'}
                      />
                      <FieldError error={fieldErrors.unNumber} />
                    </Field>
                  )}

                  {/* Shipper / Consignee */}
                  <div className="grid grid-cols-2 gap-4">
                    <Field
                      id="shipperCompany"
                      label={
                        <>
                          Shipper
                          <Req />
                        </>
                      }
                    >
                      <Input
                        id="shipperCompany"
                        placeholder="Company"
                        value={shipperCompany}
                        onChange={(e) => setShipperCompany(e.target.value)}
                        aria-invalid={flaggedField === 'shipperCompany'}
                      />
                    </Field>
                    <Field
                      id="consigneeName"
                      label={
                        <>
                          Consignee name
                          <Req />
                        </>
                      }
                    >
                      <Input
                        id="consigneeName"
                        placeholder="Name"
                        value={consigneeName}
                        onChange={(e) => setConsigneeName(e.target.value)}
                        aria-invalid={flaggedField === 'consigneeName'}
                      />
                    </Field>
                  </div>

                  {/* Shipper phone / Consignee phone */}
                  <div className="grid grid-cols-2 gap-4">
                    <Field id="shipperPhone" label="Shipper phone">
                      <Input
                        id="shipperPhone"
                        placeholder="Optional"
                        value={shipperPhone}
                        onChange={(e) => setShipperPhone(e.target.value)}
                      />
                    </Field>
                    <Field id="consigneePhone" label="Consignee phone">
                      <Input
                        id="consigneePhone"
                        placeholder="Optional"
                        value={consigneePhone}
                        onChange={(e) => setConsigneePhone(e.target.value)}
                      />
                    </Field>
                  </div>

                  {/* Consignee address (full-width, API needs it separately) */}
                  <Field
                    id="consigneeAddress"
                    label={
                      <>
                        Consignee address
                        <Req />
                      </>
                    }
                  >
                    <Input
                      id="consigneeAddress"
                      placeholder="Address"
                      value={consigneeAddress}
                      onChange={(e) => setConsigneeAddress(e.target.value)}
                      aria-invalid={flaggedField === 'consigneeAddress'}
                    />
                  </Field>
                </div>
              </section>
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
                canSubmit={canSubmit}
                submitting={submitting}
                volumeM3={volumeM3}
                onSubmit={handleSubmit}
                disabledReason={disabledReason}
                onDisabledClick={handleDisabledClick}
                submitError={submitError}
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
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold ${bold ? '' : 'text-foreground/80'}`}>{value}</span>
    </div>
  )
}

function FieldError({ error }: { error?: { code: string; message: string } }) {
  if (!error) return null
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>
        <span>
          <strong>{error.code}</strong> · {error.message}
        </span>
      </AlertDescription>
    </Alert>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your flight</CardTitle>
        </CardHeader>
        <CardContent>
          <Card className="gap-0 py-3 shadow-none">
            <CardContent className="px-3">
              <p className="mb-3 text-sm">
                <span className="font-semibold text-primary">{quote.flightNumber}</span>{' '}
                <span className="text-muted-foreground">{formatDate(quote.depAt.slice(0, 10))}</span>
              </p>
              <div className="flex items-center justify-between">
                <div className="text-center">
                  <p className="text-2xl font-bold">{formatTime(quote.depAt)}</p>
                  <p className="text-xs text-muted-foreground">
                    {quote.origin} · {quote.originName}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Plane className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{durationText(quote.depAt, quote.arrAt)}</span>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{formatTime(quote.arrAt)}</p>
                  <p className="text-xs text-muted-foreground">
                    {quote.destination} · {quote.destinationName}
                  </p>
                </div>
              </div>
              <Separator className="my-2" />
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Aircraft</p>
                  <p className="font-medium">{quote.aircraft || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Room before you</p>
                  <p className="font-medium">{quote.availableKg.toLocaleString()} kg</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Distance</p>
                  <p className="font-medium">{quote.distanceKm.toLocaleString()} km</p>
                </div>
              </div>
              {infoNote && (
                <Alert className="mt-2">
                  <Info />
                  <AlertDescription>{infoNote}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Cargo space can still change until your cargo is loaded.</p>
        </CardContent>
      </Card>
    )
  }

  if (quoteError?.code === 'NO_FLIGHT_AVAILABLE') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">No flight available</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              <span>
                <strong>NO_FLIGHT_AVAILABLE</strong> · {quoteError.message}
              </span>
            </AlertDescription>
          </Alert>
          {daysWithRoom.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Days with room for {weightKg.toLocaleString()} kg</p>
              <div className="flex flex-wrap gap-1.5">
                {daysWithRoom.map((d) => (
                  <Button key={d.date} type="button" variant="secondary" size="sm" onClick={() => onPickDate(d.date)}>
                    {new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Assigned flight</CardTitle>
      </CardHeader>
      <CardContent>
        <Card className="gap-1 py-4 shadow-none">
          <CardContent className="px-4">
            <p className="font-semibold">No flight assigned</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canQuote && quoteLoading ? 'Checking…' : 'No flight is assigned until the checks pass.'}
            </p>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
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
  disabledReason,
  onDisabledClick,
  submitError,
}: {
  quote: QuoteResult | null
  quoteError: { code: string; message: string } | null
  quoteLoading: boolean
  canSubmit: boolean
  submitting: boolean
  volumeM3: string
  onSubmit: () => void
  disabledReason: string | null
  onDisabledClick: () => void
  submitError: string
}) {
  const hasQuoteValues = quote != null
  const commodityBand = hasQuoteValues ? `${quote.commodityName}, ${quote.bandLabel}` : '—'
  const rateLabel = hasQuoteValues ? `${quote.ratePerKg.toFixed(2)} / kg` : '—'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quote</CardTitle>
      </CardHeader>
      <CardContent>
        {quoteLoading && (
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
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
          <Separator />
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total due</span>
            <span className="text-3xl font-bold">{hasQuoteValues ? `${quote.currency} ${quote.charge.toFixed(2)}` : '—'}</span>
          </div>
          <p className="text-xs text-muted-foreground">Minimum charge USD 50. Cancel for free any time before it is loaded. Full refund.</p>

          {quoteError && quoteError.code === 'NO_FLIGHT_AVAILABLE' && (
            <p className="text-xs text-destructive">No flight available on the selected date.</p>
          )}

          {submitError && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {disabledReason && <p className="text-center text-xs text-muted-foreground">{disabledReason}</p>}

          <Button
            className="mt-2 h-11 w-full"
            variant={canSubmit || submitting ? 'default' : 'secondary'}
            onClick={canSubmit ? onSubmit : !submitting ? onDisabledClick : undefined}
            type="button"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? 'Booking…' : 'Book and pay'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Ship date calendar ────────────────────────────────────────── */

function toLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ShipCalendar({
  dates,
  value,
  onChange,
  calMonth,
  onCalMonthChange,
  weightKg,
  flagged,
}: {
  dates: ShipDateInfo[]
  value: string
  onChange: (d: string) => void
  calMonth: { year: number; month: number }
  onCalMonthChange: (m: { year: number; month: number }) => void
  weightKg: number
  flagged?: boolean
}) {
  const dateMap = useMemo(() => new Map(dates.map((d) => [d.date, d])), [dates])
  const range = useMemo(
    () => (dates.length === 0 ? null : { min: toLocalDate(dates[0].date), max: toLocalDate(dates[dates.length - 1].date) }),
    [dates],
  )

  const isDisabled = (day: Date) => {
    const info = dateMap.get(toDateStr(day))
    if (!info?.hasOpenFlight) return true
    return weightKg > 0 && info.maxAvailableKg < weightKg
  }

  return (
    <Card className={`w-fit py-0 ${flagged ? 'border-destructive' : ''}`}>
      <CardContent className="p-0">
        <Calendar
          mode="single"
          weekStartsOn={1}
          showOutsideDays={false}
          month={new Date(calMonth.year, calMonth.month, 1)}
          onMonthChange={(d) => onCalMonthChange({ year: d.getFullYear(), month: d.getMonth() })}
          selected={value ? toLocalDate(value) : undefined}
          onSelect={(d) => d && onChange(toDateStr(d))}
          disabled={isDisabled}
          startMonth={range?.min}
          endMonth={range?.max}
        />
        <p className="px-4 pb-3 text-[10px] text-muted-foreground">Grey days have no flight, or not enough room for your weight.</p>
      </CardContent>
    </Card>
  )
}
