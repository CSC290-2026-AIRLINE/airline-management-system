// Feature 12 — Onboard Products. The Add Extra Services page (page 2
// of the Figma). The customer picks a flight, picks a passenger, picks
// a product, and the right-column "Your order" card shows the running
// total. On Place order: $0 short-circuits to confirmed + back to the
// booking; >$0 creates a pending_payment order and shows a dev alert
// (F5 hand-off comes in a later page).
//
// Data flow:
// - The booking is fetched once to get passengers + flights.
// - Catalog + cabin setting are re-fetched whenever the active flight
//   changes. The in-memory cart is also reset on flight switch —
//   per-passenger choices belong to the flight they were made for.
// - The cart is a flat list of lines keyed by passengerId. A passenger
//   without entries is on the cabin's default meal (no order line).
// - On Place order: flatten the cart into payload lines, then either
//   confirm+return ($0) or stay put with a dev alert (>$0).
//
// UI: meals use the radio-row UI (single choice per passenger);
// snacks / drinks / duty-free use a table with a quantity stepper.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppAuth } from '../../auth/AuthProvider'
import { cancelProductOrder, confirmOrderDev, fetchBooking, fetchCabinSetting, fetchCatalog, placeOrder } from './api'
import { CabinInfoStrip } from './CabinInfoStrip'
import { CategoryTabs } from './CategoryTabs'
import { CountdownBanner } from './CountdownBanner'
import { CustomerNav } from './CustomerNav'
import { FlightSwitcher } from './FlightSwitcher'
import { OrderSummary } from './OrderSummary'
import { PassengerPicker } from './PassengerPicker'
import { ProductList } from './ProductList'
import { defaultCutoffFor } from './format'
import type { Booking, CabinSetting, Cart, CartLine, PlaceOrderPayload, Product } from './types'

export interface Props {
  bookingId: string
  cart?: 'snacks' | 'duty-free' | 'empty' | 'none' | undefined
  f5?: 'pending' | 'failed' | 'confirmed' | 'none' | undefined
}

type BookingState = { kind: 'loading' } | { kind: 'error'; error: string } | { kind: 'ready'; booking: Booking }

type CatalogState =
  | { kind: 'idle' }
  | { kind: 'ready'; flightId: string; products: Product[]; setting: CabinSetting }
  | { kind: 'error'; flightId: string; error: string }

type Tab = 'meals' | 'snacks' | 'duty-free'

const DEFAULT_MEAL_PRODUCT_ID = 'prod-default'

function productsForTab(products: Product[], tab: Tab): Product[] {
  if (tab === 'meals') return products.filter((p) => p.category === 'meal')
  if (tab === 'snacks') return products.filter((p) => p.category === 'snack' || p.category === 'beverage')
  return products.filter((p) => p.category === 'duty_free')
}

function tabLabel(tab: Tab): string {
  if (tab === 'meals') return 'Meals'
  if (tab === 'snacks') return 'Snacks and drinks'
  return 'Duty-free'
}

function tabSubtitle(tab: Tab): string {
  if (tab === 'meals') {
    return 'Tap a meal for the selected passenger. Meals are free on complimentary flights and for tier members. Premium meals are always charged. Passengers who choose nothing get the default meal at no charge.'
  }
  if (tab === 'snacks') return 'Served in your cabin. Charged at full price, tier or not.'
  return 'Order ahead and collect on board. Alcohol is for adults only and ID is checked at collection.'
}

function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function cartFor(cart: NonNullable<Props['cart']>, somchaiId: string): Cart {
  if (cart === 'empty') return {}
  if (cart === 'snacks') {
    return {
      [somchaiId]: [
        {
          productId: 'prod-beef',
          productName: 'Braised beef, mash and greens',
          category: 'meal',
          quantity: 1,
          unitPrice: 0,
          priceBasis: 'included',
        },
        {
          productId: 'prod-nuts',
          productName: 'Mixed roasted nuts',
          category: 'snack',
          quantity: 2,
          unitPrice: 4,
          priceBasis: 'standard',
        },
        {
          productId: 'prod-coffee',
          productName: 'Cold brew coffee',
          category: 'beverage',
          quantity: 1,
          unitPrice: 5,
          priceBasis: 'standard',
        },
      ],
    }
  }
  return {
    [somchaiId]: [
      {
        productId: 'prod-beef',
        productName: 'Braised beef, mash and greens',
        category: 'meal',
        quantity: 1,
        unitPrice: 0,
        priceBasis: 'included',
      },
      {
        productId: 'prod-perfume',
        productName: 'Jasmine eau de parfum, 50 ml',
        category: 'duty_free',
        quantity: 1,
        unitPrice: 62,
        priceBasis: 'standard',
      },
    ],
  }
}

function tabFor(cart: NonNullable<Props['cart']>): Tab {
  if (cart === 'snacks') return 'snacks'
  if (cart === 'duty-free') return 'duty-free'
  return 'meals'
}

export function AddExtraServicesPage({ bookingId, cart: cartPreset, f5: f5Preset }: Props) {
  const { fetchWithAuth, isLoading: isAuthLoading } = useAppAuth()
  const navigate = useNavigate()

  const [bookingState, setBookingState] = useState<BookingState>({ kind: 'loading' })
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null)
  const [selectedPassengerId, setSelectedPassengerId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('meals')
  const [cart, setCart] = useState<Cart>({})
  const [catalogState, setCatalogState] = useState<CatalogState>({ kind: 'idle' })
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const [isResolvingF5, setIsResolvingF5] = useState(false)
  const [paymentFailed, setPaymentFailed] = useState(false)
  const [orderConfirmed, setOrderConfirmed] = useState(false)
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null)
  const [alert, setAlert] = useState<string | null>(null)
  const now = useNow()
  const cartSeededRef = useRef(false)

  useEffect(() => {
    if (isAuthLoading) return
    let cancelled = false
    fetchBooking(bookingId, fetchWithAuth)
      .then((b) => {
        if (cancelled) return
        setBookingState({ kind: 'ready', booking: b })
        setSelectedFlightId((prev) => prev ?? b.flights[0]?.id ?? null)
        setSelectedPassengerId((prev) => prev ?? b.passengers[0]?.id ?? null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setBookingState({
          kind: 'error',
          error: e instanceof Error ? e.message : 'Failed to load booking',
        })
      })
    return () => {
      cancelled = true
    }
  }, [bookingId, fetchWithAuth, isAuthLoading])

  useEffect(() => {
    if (!selectedFlightId) return
    let cancelled = false
    Promise.all([fetchCatalog(selectedFlightId, fetchWithAuth), fetchCabinSetting(selectedFlightId, fetchWithAuth)])
      .then(([products, setting]) => {
        if (cancelled) return
        setCatalogState({ kind: 'ready', flightId: selectedFlightId, products, setting })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setCatalogState({
          kind: 'error',
          flightId: selectedFlightId,
          error: e instanceof Error ? e.message : 'Failed to load catalog',
        })
      })
    return () => {
      cancelled = true
    }
  }, [selectedFlightId, fetchWithAuth])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (!cartPreset || cartPreset === 'none') return
    if (!f5Preset || f5Preset === 'none') return
    if (cartSeededRef.current) return
    if (bookingState.kind !== 'ready') return
    if (catalogState.kind !== 'ready' || catalogState.flightId !== selectedFlightId) return
    if (!selectedPassengerId) return
    const somchai = bookingState.booking.passengers[0]
    if (!somchai) return
    const seeded: Cart = cartFor(cartPreset, somchai.id)
    const targetTab: Tab = tabFor(cartPreset)
    const targetPendingOrderId: string | null = f5Preset === 'pending' ? 'PO-DEV-WAITING' : null
    const targetPaymentFailed: boolean = f5Preset === 'failed'
    const targetOrderConfirmed: boolean = f5Preset === 'confirmed'
    const targetConfirmedOrderId: string | null = f5Preset === 'confirmed' ? 'PO-2052' : null
    const targetCart: Cart = f5Preset === 'confirmed' ? {} : seeded
    const targetPassengerId = somchai.id
    Promise.resolve().then(() => {
      if (cartSeededRef.current) return
      if (targetPassengerId !== selectedPassengerId) setSelectedPassengerId(targetPassengerId)
      setActiveTab(targetTab)
      setCart(targetCart)
      if (targetPendingOrderId !== null) setPendingOrderId(targetPendingOrderId)
      if (targetPaymentFailed) {
        setPaymentFailed(true)
      }
      if (targetOrderConfirmed) {
        setOrderConfirmed(true)
        setConfirmedOrderId(targetConfirmedOrderId)
      }
      cartSeededRef.current = true
    })
  }, [cartPreset, f5Preset, bookingState, catalogState, selectedFlightId, selectedPassengerId])

  const booking = bookingState.kind === 'ready' ? bookingState.booking : null
  const selectedFlight = booking?.flights.find((f) => f.id === selectedFlightId) ?? null
  const cutoffAt = selectedFlight ? (selectedFlight.cutoffAt ?? defaultCutoffFor(selectedFlight.scheduledDeparture)) : null
  const isOpen = cutoffAt ? new Date(cutoffAt).getTime() > now : false

  const catalog: { kind: 'loading' | 'error' | 'ready'; products: Product[]; setting: CabinSetting | null; error: string | null } =
    catalogState.kind === 'ready' && catalogState.flightId === selectedFlightId
      ? { kind: 'ready', products: catalogState.products, setting: catalogState.setting, error: null }
      : catalogState.kind === 'error' && catalogState.flightId === selectedFlightId
        ? { kind: 'error', products: [], setting: null, error: catalogState.error }
        : { kind: 'loading', products: [], setting: null, error: null }

  const products = catalog.kind === 'ready' ? productsForTab(catalog.products, activeTab) : []

  const selectedMealProductId = useMemo(() => {
    if (!selectedPassengerId) return null
    const lines = cart[selectedPassengerId] ?? []
    const mealLine = lines.find((l) => l.category === 'meal')
    return mealLine ? mealLine.productId : DEFAULT_MEAL_PRODUCT_ID
  }, [selectedPassengerId, cart])

  const quantities = useMemo(() => {
    const m = new Map<string, number>()
    if (!selectedPassengerId) return m
    const lines = cart[selectedPassengerId] ?? []
    for (const line of lines) {
      if (line.category === 'meal') continue
      m.set(line.productId, line.quantity)
    }
    return m
  }, [selectedPassengerId, cart])

  const canPlaceOrder = bookingState.kind === 'ready' && catalog.kind === 'ready' && isOpen

  function handleFlightSwitch(flightId: string) {
    setSelectedFlightId(flightId)
    setCart({})
    setCatalogState({ kind: 'idle' })
    setAlert(null)
  }

  function handlePassengerSelect(passengerId: string) {
    setSelectedPassengerId(passengerId)
    const mealLine = cart[passengerId]?.find((l) => l.category === 'meal')
    if (mealLine) {
      setActiveTab('meals')
    }
  }

  function handleSelectMeal(productId: string) {
    if (!selectedPassengerId || catalog.kind !== 'ready') return
    const product = catalog.products.find((p) => p.id === productId)
    if (!product || product.category !== 'meal') return
    const existing = cart[selectedPassengerId] ?? []
    if (product.isDefaultChoice) {
      const next = existing.filter((l) => l.category !== 'meal')
      setCart((prev) => ({ ...prev, [selectedPassengerId]: next }))
    } else {
      const others = existing.filter((l) => l.category !== 'meal')
      const newLine: CartLine = {
        productId: product.id,
        productName: product.name,
        category: product.category,
        quantity: 1,
        unitPrice: product.unitPrice,
        priceBasis: product.unitPrice === 0 ? 'included' : 'standard',
      }
      setCart((prev) => ({ ...prev, [selectedPassengerId]: [...others, newLine] }))
    }
    setAlert(null)
  }

  function handleAddOne(productId: string) {
    if (!selectedPassengerId || catalog.kind !== 'ready') return
    const product = catalog.products.find((p) => p.id === productId)
    if (!product || product.category === 'meal') return
    const existing = cart[selectedPassengerId] ?? []
    const found = existing.find((l) => l.productId === productId)
    if (found) {
      const next = existing.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
      setCart((prev) => ({ ...prev, [selectedPassengerId]: next }))
    } else {
      const newLine: CartLine = {
        productId: product.id,
        productName: product.name,
        category: product.category,
        quantity: 1,
        unitPrice: product.unitPrice,
        priceBasis: product.unitPrice === 0 ? 'included' : 'standard',
      }
      setCart((prev) => ({ ...prev, [selectedPassengerId]: [...existing, newLine] }))
    }
    setAlert(null)
  }

  function handleRemoveOne(productId: string) {
    if (!selectedPassengerId) return
    const existing = cart[selectedPassengerId] ?? []
    const found = existing.find((l) => l.productId === productId)
    if (!found) return
    if (found.quantity > 1) {
      const next = existing.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity - 1 } : l))
      setCart((prev) => ({ ...prev, [selectedPassengerId]: next }))
    } else {
      const next = existing.filter((l) => l.productId !== productId)
      setCart((prev) => ({ ...prev, [selectedPassengerId]: next }))
    }
    setAlert(null)
  }

  async function handlePlaceOrder() {
    if (!booking || !selectedFlight) return
    const lines: PlaceOrderPayload['lines'] = []
    for (const passengerId of Object.keys(cart)) {
      for (const line of cart[passengerId] ?? []) {
        lines.push({
          productId: line.productId,
          category: line.category,
          passengerId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          priceBasis: line.priceBasis,
        })
      }
    }
    if (lines.length === 0) {
      await navigate({ to: '/bookings/$bookingId', params: { bookingId } })
      return
    }

    setIsPlacingOrder(true)
    setAlert(null)
    try {
      const placed = await placeOrder({ bookingId: booking.id, flightId: selectedFlight.id, lines }, fetchWithAuth)
      if (placed.totalAmount === 0) {
        await confirmOrderDev(placed.id, fetchWithAuth)
        await navigate({ to: '/bookings/$bookingId', params: { bookingId } })
        return
      }
      setPendingOrderId(placed.id)
    } catch (e: unknown) {
      setAlert(e instanceof Error ? e.message : 'Failed to place order')
    } finally {
      setIsPlacingOrder(false)
    }
  }

  async function handleF5ReportsPaid() {
    if (!pendingOrderId) return
    setIsResolvingF5(true)
    setAlert(null)
    try {
      await confirmOrderDev(pendingOrderId, fetchWithAuth)
      setPendingOrderId(null)
      setOrderConfirmed(true)
      setConfirmedOrderId(pendingOrderId)
      setCart({})
    } catch (e: unknown) {
      setAlert(e instanceof Error ? e.message : 'Failed to confirm order')
    } finally {
      setIsResolvingF5(false)
    }
  }

  async function handleF5ReportsFailed() {
    if (!pendingOrderId) return
    setIsResolvingF5(true)
    setAlert(null)
    try {
      await cancelProductOrder(pendingOrderId, fetchWithAuth)
      setPendingOrderId(null)
      setPaymentFailed(true)
    } catch (e: unknown) {
      setAlert(e instanceof Error ? e.message : 'Failed to cancel order')
    } finally {
      setIsResolvingF5(false)
    }
  }

  function handleBackToOrder() {
    setPaymentFailed(false)
    setAlert(null)
  }

  function handleViewInBooking() {
    if (typeof window !== 'undefined') {
      const id = confirmedOrderId ?? 'PO-2052'
      try {
        window.sessionStorage.setItem('f12:order-confirmed', id)
      } catch {
        // sessionStorage may be unavailable (private mode, disabled).
        // Best-effort: navigate without the notice stash and let the
        // booking page fall through to its unpreseted (no-notice) state.
      }
      void navigate({ to: '/bookings/$bookingId', params: { bookingId } })
    }
  }

  function handleOrderMore() {
    setOrderConfirmed(false)
    setConfirmedOrderId(null)
    setAlert(null)
  }

  if (bookingState.kind === 'loading' || isAuthLoading) {
    return (
      <div className="block w-full max-w-[1440px] mx-auto px-[45px] pt-6 pb-24 box-border text-left text-foreground font-sans">
        <CustomerNav />
        <p className="py-12 text-center text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (bookingState.kind === 'error') {
    return (
      <div className="block w-full max-w-[1440px] mx-auto px-[45px] pt-6 pb-24 box-border text-left text-foreground font-sans">
        <CustomerNav />
        <p className="text-[#b42318] bg-[#fff3f2] border border-[#fdb5b0] rounded-lg px-4 py-3 my-4 text-sm leading-[1.45]" role="alert">
          {bookingState.error}
        </p>
      </div>
    )
  }

  if (!booking || !selectedFlight || !selectedPassengerId) {
    return (
      <div className="block w-full max-w-[1440px] mx-auto px-[45px] pt-6 pb-24 box-border text-left text-foreground font-sans">
        <CustomerNav />
        <p className="py-12 text-center text-muted-foreground">No booking to show.</p>
      </div>
    )
  }

  const selectedPassenger = booking.passengers.find((p) => p.id === selectedPassengerId) ?? null

  return (
    <div className="block w-full max-w-[1440px] mx-auto px-[45px] pt-6 pb-24 box-border text-left text-foreground font-sans flex flex-col gap-6">
      <CustomerNav />
      <a
        href={`/bookings/${booking.id}`}
        className="inline-flex items-center gap-1 bg-white border border-border rounded-lg px-4 py-2.5 text-foreground text-sm font-semibold font-sans no-underline leading-tight self-start hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        onClick={(e) => {
          e.preventDefault()
          void navigate({ to: '/bookings/$bookingId', params: { bookingId: booking.id } })
        }}
      >
        <span>← Back to booking </span>
        <span className="font-mono">{booking.reference}</span>
      </a>

      <FlightSwitcher flights={booking.flights} selectedId={selectedFlight.id} onSelect={handleFlightSwitch} />

      <CountdownBanner cutoffAt={cutoffAt} isOpen={isOpen} />

      {catalog.kind === 'ready' && catalog.setting ? (
        <CabinInfoStrip setting={catalog.setting} />
      ) : (
        <p className="text-muted-foreground text-sm leading-relaxed max-w-[720px] mt-3">Loading cabin policy…</p>
      )}

      <div className="grid gap-6 items-start mt-0" style={{ gridTemplateColumns: 'minmax(0, 776px) 400px' }}>
        <div className="min-w-0 flex flex-col gap-5">
          <PassengerPicker passengers={booking.passengers} cart={cart} selectedId={selectedPassengerId} onSelect={handlePassengerSelect} />

          <CategoryTabs active={activeTab} onSelect={setActiveTab} />

          <div className="bg-card border border-border rounded-2xl p-5 shadow-[0_12px_32px_rgba(15,26,51,0.08)] mt-0 overflow-hidden">
            <h3 className="font-sans font-semibold text-foreground text-base m-0 mb-1 tracking-[-0.1px]">
              {tabLabel(activeTab)} for {selectedPassenger?.firstName ?? ''}
            </h3>
            <p className="m-0 mb-3 text-muted-foreground text-sm leading-relaxed">{tabSubtitle(activeTab)}</p>

            {catalog.kind === 'loading' ? (
              <p className="my-2 text-muted-foreground text-sm">Loading products…</p>
            ) : catalog.kind === 'error' ? (
              <p
                className="text-[#b42318] bg-[#fff3f2] border border-[#fdb5b0] rounded-lg px-4 py-3 my-4 text-sm leading-[1.45]"
                role="alert"
              >
                {catalog.error}
              </p>
            ) : (
              <ProductList
                products={products}
                selectedMealProductId={selectedMealProductId}
                quantities={quantities}
                currency="USD"
                passengerFirstName={selectedPassenger?.firstName ?? ''}
                onSelectMeal={handleSelectMeal}
                onAddOne={handleAddOne}
                onRemoveOne={handleRemoveOne}
                disabled={pendingOrderId !== null || paymentFailed || orderConfirmed}
              />
            )}
          </div>
        </div>

        <div className="min-w-0 sticky top-4">
          <OrderSummary
            flightNumber={selectedFlight.flightNumber}
            flightOriginCode={selectedFlight.origin.code}
            flightDestinationCode={selectedFlight.destination.code}
            cart={cart}
            passengers={booking.passengers}
            currency="USD"
            canPlaceOrder={canPlaceOrder && !paymentFailed && !orderConfirmed}
            isPlacingOrder={isPlacingOrder}
            isResolvingF5={isResolvingF5}
            pendingOrderId={pendingOrderId}
            paymentFailed={paymentFailed}
            orderConfirmed={orderConfirmed}
            confirmedOrderId={confirmedOrderId}
            alert={alert}
            onPlaceOrder={() => void handlePlaceOrder()}
            onF5ReportsPaid={() => void handleF5ReportsPaid()}
            onF5ReportsFailed={() => void handleF5ReportsFailed()}
            onBackToOrder={handleBackToOrder}
            onViewInBooking={() => void handleViewInBooking()}
            onOrderMore={handleOrderMore}
          />
        </div>
      </div>
    </div>
  )
}
