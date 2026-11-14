import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Package, Plane, AlertCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Input } from '@customer-web/components/ui/input'
import { Label } from '@customer-web/components/ui/label'
import { Badge } from '@customer-web/components/ui/badge'
import { useCustomerCargoApi, type CargoRoute, type CommodityType, type QuoteResult, CargoApiError } from './cargo-api'

export default function ShipCargoPage() {
  const api = useCustomerCargoApi()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [routes, setRoutes] = useState<CargoRoute[]>([])
  const [commodityTypes, setCommodityTypes] = useState<CommodityType[]>([])
  const [loading, setLoading] = useState(true)

  // Step 1
  const [routeId, setRouteId] = useState('')
  const [shipDate, setShipDate] = useState('')

  // Step 2
  const [commodityTypeId, setCommodityTypeId] = useState('')
  const [pieces, setPieces] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [volumeM3, setVolumeM3] = useState('')
  const [description, setDescription] = useState('')
  const [unNumber, setUnNumber] = useState('')

  // Step 3
  const [shipperCompany, setShipperCompany] = useState('')
  const [shipperPhone, setShipperPhone] = useState('')
  const [consigneeName, setConsigneeName] = useState('')
  const [consigneeAddress, setConsigneeAddress] = useState('')
  const [consigneePhone, setConsigneePhone] = useState('')

  // Quote
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [quoteLoading, setQuoteLoading] = useState(false)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [r, c] = await Promise.all([api.listRoutes(), api.listCommodityTypes()])
        if (!cancelled) {
          setRoutes(r)
          setCommodityTypes(c)
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

  const selectedCommodity = commodityTypes.find((c) => c.id === commodityTypeId)
  const isDangerous = selectedCommodity?.handlingClass === 'dangerous'

  const canQuote =
    routeId && shipDate && commodityTypeId && Number(pieces) >= 1 && Number(weightKg) > 0 && Number(volumeM3) > 0 && description.trim()

  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchQuote = useCallback(async () => {
    if (!canQuote) {
      setQuote(null)
      setQuoteError('')
      return
    }
    setQuoteLoading(true)
    setQuoteError('')
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
      setQuote(null)
      if (err instanceof CargoApiError) {
        const friendly = friendlyQuoteError(err.code, err.message)
        setQuoteError(friendly)
      } else {
        setQuoteError('Could not get a quote. Please check your inputs.')
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

  const step1Valid = routeId && shipDate
  const step2Valid = commodityTypeId && Number(pieces) >= 1 && Number(weightKg) > 0 && Number(volumeM3) > 0 && description.trim()
  const step3Valid = shipperCompany.trim() && consigneeName.trim() && consigneeAddress.trim()
  const canSubmit = quote && step1Valid && step2Valid && step3Valid && !submitting

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
      if (err instanceof CargoApiError) {
        setSubmitError(err.message)
      } else {
        setSubmitError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Ship Cargo</h1>

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
              s === step ? 'bg-primary text-primary-foreground' : s < step ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">
          {step === 1 ? 'Route & date' : step === 2 ? 'Goods' : 'Shipper & consignee'}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {/* Step 1: Route and date */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plane className="h-5 w-5" /> Route and Date
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="route">Route</Label>
                  <select
                    id="route"
                    value={routeId}
                    onChange={(e) => setRouteId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select a route</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.origin} → {r.destination} · {r.distanceKm} km
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shipDate">Ship date</Label>
                  <Input id="shipDate" type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)} disabled={!step1Valid}>
                    Next <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Goods */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" /> Goods
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="commodityType">Commodity type</Label>
                  <select
                    id="commodityType"
                    value={commodityTypeId}
                    onChange={(e) => setCommodityTypeId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select commodity type</option>
                    {commodityTypes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.handlingClass})
                      </option>
                    ))}
                  </select>
                  {selectedCommodity && (
                    <p className="text-xs text-muted-foreground">
                      Weight: {selectedCommodity.minWeightKg}–{selectedCommodity.maxWeightKg} kg · Max per piece:{' '}
                      {selectedCommodity.maxPieceWeightKg} kg
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="pieces">Pieces</Label>
                    <Input id="pieces" type="number" min="1" value={pieces} onChange={(e) => setPieces(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="weight">Weight (kg)</Label>
                    <Input id="weight" type="number" min="0" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="volume">Volume (m³)</Label>
                    <Input id="volume" type="number" min="0" step="0.001" value={volumeM3} onChange={(e) => setVolumeM3(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Goods description</Label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Describe the goods being shipped"
                  />
                </div>
                {isDangerous && (
                  <div className="grid gap-2">
                    <Label htmlFor="unNumber">UN Number</Label>
                    <Input
                      id="unNumber"
                      placeholder="UNxxxx"
                      value={unNumber}
                      onChange={(e) => setUnNumber(e.target.value)}
                      maxLength={6}
                    />
                  </div>
                )}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ChevronLeft className="mr-1 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={!step2Valid}>
                    Next <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Shipper and consignee */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Shipper & Consignee</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="shipperCompany">Shipper company</Label>
                    <Input id="shipperCompany" value={shipperCompany} onChange={(e) => setShipperCompany(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="shipperPhone">Shipper phone</Label>
                    <Input id="shipperPhone" value={shipperPhone} onChange={(e) => setShipperPhone(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="consigneeName">Consignee name</Label>
                  <Input id="consigneeName" value={consigneeName} onChange={(e) => setConsigneeName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="consigneeAddress">Consignee address</Label>
                  <Input id="consigneeAddress" value={consigneeAddress} onChange={(e) => setConsigneeAddress(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="consigneePhone">Consignee phone</Label>
                  <Input id="consigneePhone" value={consigneePhone} onChange={(e) => setConsigneePhone(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">Cargo space can still change until the cargo is loaded.</p>
                {submitError && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {submitError}
                  </div>
                )}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ChevronLeft className="mr-1 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={handleSubmit} disabled={!canSubmit}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Book and pay
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Quote card */}
        <div className="lg:sticky lg:top-20">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quote</CardTitle>
            </CardHeader>
            <CardContent>
              {quoteLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculating…
                </div>
              )}
              {quoteError && (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {quoteError}
                </div>
              )}
              {!quoteLoading && !quoteError && !quote && (
                <p className="text-sm text-muted-foreground">Fill in route, date and goods to see a quote.</p>
              )}
              {quote && !quoteLoading && (
                <div className="grid gap-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Flight</span>
                    <span className="font-medium">{quote.flightNumber}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Departure</span>
                    <span>{new Date(quote.depAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Chargeable kg</span>
                    <span>
                      {quote.chargeableKg.toFixed(1)} kg
                      {Number(volumeM3) > 0 && Number(weightKg) > 0 && quote.chargeableKg > Number(weightKg) && ' (billed on volume)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Rate per kg</span>
                    <span>
                      {quote.currency} {quote.ratePerKg.toFixed(2)}
                    </span>
                  </div>
                  <hr className="border-border" />
                  <div className="flex items-center justify-between text-base font-semibold">
                    <span>Total</span>
                    <Badge variant="secondary" className="text-base">
                      {quote.currency} {quote.charge.toFixed(2)}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function friendlyQuoteError(code: string, message: string): string {
  switch (code) {
    case 'NO_FLIGHT_AVAILABLE':
      return 'No flight on this day has room for this weight. Try another day.'
    case 'PROHIBITED_ITEM':
      return message
    case 'WEIGHT_OUT_OF_RANGE':
      return message
    case 'PIECE_TOO_HEAVY':
      return message
    case 'UN_NUMBER_REQUIRED':
      return 'Dangerous goods require a UN number in the format UNxxxx.'
    case 'NO_RATE':
      return 'No rate available for this route and commodity type.'
    default:
      return message || 'Could not get a quote.'
  }
}
