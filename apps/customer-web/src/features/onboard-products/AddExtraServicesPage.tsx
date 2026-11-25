import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppAuth } from '../../auth/AuthProvider'
import { fetchBooking, fetchCatalog, placeOrder, resolveDemoPayment } from './api'
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
}

type BookingState = { kind: 'loading' } | { kind: 'error'; error: string } | { kind: 'ready'; booking: Booking }

type CatalogState =
  | { kind: 'idle' }
  | {
      kind: 'ready'
      flightId: string
      products: Product[]
      setting: CabinSetting
      cutoffAt: string
      currency: string
      complimentarySnackAvailable: boolean
    }
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
  if (tab === 'snacks') return 'Served in your cabin.'
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

export function AddExtraServicesPage({ bookingId }: Props) {
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

  const booking = bookingState.kind === 'ready' ? bookingState.booking : null
  const selectedFlight = booking?.flights.find((flight) => flight.id === selectedFlightId) ?? null

  useEffect(() => {
    if (!selectedFlight) return
    const { id: flightId } = selectedFlight
    let cancelled = false
    let request = 0
    const refresh = () => {
      const current = ++request
      fetchCatalog(selectedFlight, fetchWithAuth)
        .then((catalog) => {
          if (!cancelled && current === request) setCatalogState({ kind: 'ready', flightId, ...catalog })
        })
        .catch((error: unknown) => {
          if (cancelled || current !== request) return
          setCatalogState({ kind: 'error', flightId, error: error instanceof Error ? error.message : 'Failed to load catalog' })
        })
    }
    refresh()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [selectedFlight, fetchWithAuth])

  const liveCatalog = catalogState.kind === 'ready' && catalogState.flightId === selectedFlightId ? catalogState : null
  let includeSnack = liveCatalog?.complimentarySnackAvailable ?? false
  const displayedCart: Cart = Object.fromEntries(
    Object.entries(cart).map(([passengerId, lines]) => [
      passengerId,
      lines.flatMap((line): CartLine[] => {
        if (!includeSnack || (line.category !== 'snack' && line.category !== 'beverage')) return [line]
        includeSnack = false
        const included: CartLine = { ...line, quantity: 1, unitPrice: 0, priceBasis: 'included' }
        return line.quantity === 1 ? [included] : [included, { ...line, quantity: line.quantity - 1 }]
      }),
    ]),
  )
  const currency = liveCatalog?.currency ?? 'USD'
  const cutoffAt =
    liveCatalog?.cutoffAt ?? (selectedFlight ? (selectedFlight.cutoffAt ?? defaultCutoffFor(selectedFlight.scheduledDeparture)) : null)
  const isOpen = cutoffAt ? new Date(cutoffAt).getTime() > now && liveCatalog?.setting.preorderEnabled !== false : false

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

  const cartQuantities = new Map<string, number>()
  for (const lines of Object.values(cart)) {
    for (const line of lines) cartQuantities.set(line.productId, (cartQuantities.get(line.productId) ?? 0) + line.quantity)
  }

  function handleSelectMeal(productId: string) {
    if (!selectedPassengerId || catalog.kind !== 'ready') return
    const product = catalog.products.find((p) => p.id === productId)
    if (!product || product.category !== 'meal') return
    if (!product.isDefaultChoice && (cartQuantities.get(productId) ?? 0) >= (product.availableQuantity ?? Infinity)) return
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
    if ((cartQuantities.get(productId) ?? 0) >= (product.availableQuantity ?? Infinity)) return
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
          bookingPassengerId: line.category === 'meal' ? passengerId : null,
          quantity: line.quantity,
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
      const placed = await placeOrder(
        { bookingId: booking.id, flightId: selectedFlight.id, cabin: selectedFlight.cabinClass, lines },
        fetchWithAuth,
      )
      if (placed.status === 'confirmed') {
        setConfirmedOrderId(placed.id)
        setOrderConfirmed(true)
        setCart({})
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
      const order = await resolveDemoPayment(pendingOrderId, 'paid', fetchWithAuth)
      if (order.status !== 'confirmed') {
        setPendingOrderId(null)
        setPaymentFailed(true)
        return
      }
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
      await resolveDemoPayment(pendingOrderId, 'failed', fetchWithAuth)
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
      const id = confirmedOrderId
      if (!id) return
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
          <PassengerPicker
            passengers={booking.passengers}
            cart={displayedCart}
            selectedId={selectedPassengerId}
            onSelect={handlePassengerSelect}
          />

          <CategoryTabs active={activeTab} onSelect={setActiveTab} />

          <div className="bg-card border border-border rounded-2xl p-5 shadow-[0_12px_32px_rgba(15,26,51,0.08)] mt-0 overflow-hidden">
            <h3 className="font-sans font-semibold text-foreground text-base m-0 mb-1 tracking-[-0.1px]">
              {tabLabel(activeTab)} for {selectedPassenger?.firstName ?? ''}
            </h3>
            <p className="m-0 mb-3 text-muted-foreground text-sm leading-relaxed">{tabSubtitle(activeTab)}</p>

            {activeTab === 'snacks' && liveCatalog?.setting.snackService === 'complimentary' && (
              <p className="text-sm text-muted-foreground">
                {liveCatalog.complimentarySnackAvailable
                  ? 'Your first snack or drink is included. Additional items are charged.'
                  : 'Your included snack or drink is already on an order.'}
              </p>
            )}
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
                cartQuantities={cartQuantities}
                products={products}
                selectedMealProductId={selectedMealProductId}
                quantities={quantities}
                currency={currency}
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
            cart={displayedCart}
            passengers={booking.passengers}
            currency={currency}
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
