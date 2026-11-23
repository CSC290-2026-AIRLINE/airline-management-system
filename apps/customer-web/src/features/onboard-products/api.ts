// API clients for the Booking Details page and the Add Extra Services
// page. All functions take `fetchWithAuth` as a parameter so the module
// is pure and easy to swap when TanStack Query is wired up later. The
// hook lives in apps/customer-web/src/auth/AuthProvider.tsx and already
// handles the 401 → refresh dance.
//
// The calls go to the F12 backend. Set VITE_F12_MOCK=true in a dev build to
// use the in-memory mocks in `./api.dev` instead (the mock branch is dropped
// by the bundler in production builds, so no mock data ships).

import {
  cancelProductOrderMock,
  confirmOrderMock,
  fetchBookingMock,
  fetchCabinSettingMock,
  fetchCatalogMock,
  fetchProductOrdersForBookingMock,
  placeOrderMock,
} from './api.dev'
import type { BookingDetail } from '../booking-pnr/api/types'
import { defaultCutoffFor } from './format'
import {
  ApiError,
  type ApiErrorPayload,
  type Booking,
  type CabinClass,
  type CabinSetting,
  type PlaceOrderPayload,
  type PriceBasis,
  type Product,
  type ProductCategory,
  type ProductOrder,
  type ProductOrderStatus,
} from './types'

type FetchWithAuth = (path: string, init?: RequestInit) => Promise<Response>

const USE_MOCK = import.meta.env.DEV && import.meta.env.VITE_F12_MOCK === 'true'

async function parseError(res: Response): Promise<ApiError> {
  let payload: ApiErrorPayload | null = null
  try {
    payload = (await res.json()) as ApiErrorPayload
  } catch {
    // Non-JSON body; fall through to the generic message.
  }
  const code = payload?.error?.code ?? 'UNKNOWN'
  const message = payload?.error?.message ?? `Request failed with status ${res.status}`
  return new ApiError(res.status, code, message, payload?.error?.details ?? null)
}

// --- Booking (Feature 3b) ---------------------------------------------

// F12 reads the booking through F3b's own route and maps it to the shape the shop needs.
export function toShopBooking(detail: BookingDetail): Booking {
  const passengers = detail.passengers
    .filter((p) => p.passengerType !== 'infant')
    .map((p) => ({
      id: p.bookingPassengerId,
      firstName: p.firstName,
      lastName: p.lastName,
      type: p.passengerType,
      isAccountHolder: p.passengerId === detail.accountHolderPassengerId,
    }))
  const segments = [...detail.segments].sort((a, b) => a.segmentOrder - b.segmentOrder)
  const flights = segments.map((s) => ({
    id: s.flightId,
    flightNumber: s.flightNumber,
    origin: { code: s.origin, city: s.origin },
    destination: { code: s.destination, city: s.destination },
    scheduledDeparture: s.depAt,
    cabinClass: s.cabin as CabinClass,
    seatNumbers: detail.coupons.filter((c) => c.bookingSegmentId === s.bookingSegmentId && c.seatCode).map((c) => c.seatCode as string),
    cutoffAt: null,
    departureTimeZone: s.originTimeZone ?? null,
  }))
  return {
    id: detail.bookingId,
    reference: detail.reference,
    status: detail.status === 'confirmed' ? 'confirmed' : detail.status === 'cancelled' ? 'cancelled' : 'confirmed',
    passengers,
    flights,
    totalPassengers: passengers.length,
    tripType: detail.tripType === 'one_way' ? 'one_way' : 'round_trip',
    routeSummary: segments.length > 0 ? `${segments[0].origin} to ${segments[segments.length - 1].destination}` : '',
  }
}

export async function fetchBooking(reference: string, fetchWithAuth: FetchWithAuth): Promise<Booking> {
  if (USE_MOCK) {
    return fetchBookingMock()
  }
  const res = await fetchWithAuth(`/api/bookings/${encodeURIComponent(reference)}`)
  if (!res.ok) {
    throw await parseError(res)
  }
  return toShopBooking((await res.json()) as BookingDetail)
}

// --- Orders -----------------------------------------------------------

interface OrderLineWire {
  id: string
  productId: string
  productName: string
  category: ProductCategory
  bookingPassengerId: string | null
  quantity: number
  unitPriceAmount: number
  priceBasis: PriceBasis
  lineTotal: number
}

interface OrderWire {
  id: string
  bookingId: string
  flightId: string
  flightNumber: string
  status: ProductOrderStatus
  totalAmount: number
  currency: string
  paidAt: string | null
  cutoffAt: string
  cancelledAt: string | null
  createdAt: string
  lines: OrderLineWire[]
}

function toOrder(wire: OrderWire, booking: Booking | null): ProductOrder {
  const flight = booking?.flights.find((f) => f.id === wire.flightId)
  return {
    id: wire.id,
    bookingId: wire.bookingId,
    flightId: wire.flightId,
    flightNumber: wire.flightNumber,
    flightOriginCode: flight?.origin.code ?? '',
    flightDestinationCode: flight?.destination.code ?? '',
    placedAt: wire.createdAt,
    changesAllowedUntil: wire.cutoffAt,
    status: wire.status,
    paidAt: wire.paidAt,
    cancelledAt: wire.cancelledAt,
    // F5 owns refunds; F12 does not track a refund request.
    refundRequestedAt: null,
    refundId: null,
    totalAmount: wire.totalAmount,
    currency: wire.currency,
    lines: wire.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      productName: l.productName,
      category: l.category,
      quantity: l.quantity,
      unitPrice: l.unitPriceAmount,
      priceBasis: l.priceBasis,
      passengerId: l.bookingPassengerId,
      fulfillmentNote: l.category === 'duty_free' ? 'Collect on board' : null,
      lineTotal: l.lineTotal,
    })),
  }
}

export async function fetchProductOrdersForBooking(
  booking: Booking,
  fetchWithAuth: FetchWithAuth,
  preset?: 'ready' | 'duty-free' | 'waiting' | 'failed' | 'confirmed' | 'cancel-po-2041' | 'refund-requested',
): Promise<ProductOrder[]> {
  if (USE_MOCK) {
    return fetchProductOrdersForBookingMock(preset)
  }
  const res = await fetchWithAuth(`/api/product-orders?bookingId=${encodeURIComponent(booking.id)}`)
  if (!res.ok) {
    throw await parseError(res)
  }
  return ((await res.json()) as OrderWire[]).map((o) => toOrder(o, booking))
}

export async function cancelProductOrder(
  orderId: string,
  fetchWithAuth: FetchWithAuth,
  booking: Booking | null = null,
): Promise<ProductOrder> {
  if (USE_MOCK) {
    return cancelProductOrderMock(orderId)
  }
  const res = await fetchWithAuth(`/api/product-orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' })
  if (!res.ok) {
    throw await parseError(res)
  }
  return toOrder((await res.json()) as OrderWire, booking)
}

// --- Shop (catalog + cabin setting) ------------------------------------

interface CatalogWire {
  cutoffAt: string
  orderWindowOpen: boolean
  currency?: string
  settings: {
    mealService: CabinSetting['mealService']
    mealSelection: CabinSetting['mealSelection']
    includedPerPassenger: number
    preorderEnabled: boolean
    orderWindowHours: number
    premiumMealsAllowed: boolean
    snacksEnabled: boolean
    dutyFreeEnabled: boolean
  }
  products: Array<{
    id: string
    name: string
    category: ProductCategory
    typeCode: string
    priceAmount: number
    // What this customer pays per unit (the complimentary allowance and the tier benefit applied), and why.
    customerPriceAmount?: number
    priceBasis?: 'standard' | 'tier_benefit' | 'included'
    isPremium: boolean
    imageKey: string | null
    dietaryAttributes: string[]
    availableQuantity: number
    stockStatus: 'in_stock' | 'out_of_stock'
  }>
}

const THUMB_COLOR: Record<ProductCategory, string> = {
  meal: '#d3f9d8',
  snack: '#ffe5d0',
  beverage: '#dbeafe',
  duty_free: '#ede9fe',
}

// The "no pre-order" choice: no order line is created. On a complimentary cabin the passenger gets the included
// default meal; on a paid cabin nothing is served unless they buy on board, so it is labelled that way.
const DEFAULT_MEAL: Product = {
  id: 'default-meal',
  category: 'meal',
  typeCode: null,
  name: 'Default meal',
  description: 'No pre-order needed. You get the cabin default.',
  unitPrice: 0,
  isPremium: false,
  thumbnailColor: THUMB_COLOR.meal,
  imageUrl: '/products/default-meal.svg',
  isDefaultChoice: true,
}

function noPreorderChoice(mealService: CabinSetting['mealService']): Product {
  if (mealService !== 'paid') return DEFAULT_MEAL
  return {
    ...DEFAULT_MEAL,
    name: 'No pre-order',
    description: 'Meals are charged in this cabin. You can buy one on board instead.',
    priceLabel: 'On board',
  }
}

export interface ShopData {
  products: Product[]
  setting: CabinSetting
  cutoffAt: string
  orderWindowOpen: boolean
  // F4's base currency, the one the backend prices and records orders in.
  currency: string
}

export async function fetchShop(booking: Booking, flightId: string, cabin: CabinClass, fetchWithAuth: FetchWithAuth): Promise<ShopData> {
  if (USE_MOCK) {
    const [products, setting] = await Promise.all([fetchCatalogMock(flightId), fetchCabinSettingMock(flightId)])
    const flight = booking.flights.find((f) => f.id === flightId)
    return {
      products,
      setting,
      cutoffAt: flight ? (flight.cutoffAt ?? defaultCutoffFor(flight.scheduledDeparture)) : '',
      orderWindowOpen: true,
      currency: 'USD',
    }
  }
  const query = new URLSearchParams({ bookingId: booking.id, flightId, cabin })
  const res = await fetchWithAuth(`/api/catalog?${query.toString()}`)
  if (!res.ok) {
    throw await parseError(res)
  }
  const wire = (await res.json()) as CatalogWire
  const products: Product[] = wire.products
    .filter((p) => p.stockStatus === 'in_stock' || p.category === 'meal')
    .map((p) => ({
      id: p.id,
      category: p.category,
      typeCode: p.typeCode === 'STD' ? null : p.typeCode,
      name: p.name,
      description: p.dietaryAttributes.map((d) => d.replace('_', ' ')).join(', '),
      unitPrice: p.customerPriceAmount ?? p.priceAmount,
      priceLabel: p.priceBasis === 'included' ? 'Included' : p.priceBasis === 'tier_benefit' ? 'Free with your tier' : undefined,
      isPremium: p.isPremium,
      thumbnailColor: THUMB_COLOR[p.category],
      imageUrl: p.imageKey && (p.imageKey.startsWith('/') || p.imageKey.startsWith('http')) ? p.imageKey : null,
      isDefaultChoice: false,
    }))
  const hasMeals = products.some((p) => p.category === 'meal')
  return {
    products: hasMeals && wire.settings.mealService !== 'none' ? [noPreorderChoice(wire.settings.mealService), ...products] : products,
    setting: {
      flightId,
      cabin,
      mealService: wire.settings.mealService,
      mealSelection: wire.settings.mealSelection,
      includedPerPassenger: wire.settings.includedPerPassenger === 1 ? 1 : 0,
      preorderEnabled: wire.settings.preorderEnabled,
      orderWindowHours: wire.settings.orderWindowHours,
      premiumMealsAllowed: wire.settings.premiumMealsAllowed,
      snacksEnabled: wire.settings.snacksEnabled,
      dutyFreeEnabled: wire.settings.dutyFreeEnabled,
    },
    cutoffAt: wire.cutoffAt,
    orderWindowOpen: wire.orderWindowOpen,
    currency: wire.currency ?? 'USD',
  }
}

// Creates the order as `pending_payment`, reserves the stock and starts the F5 payment. A total of 0 is confirmed at once.
export async function placeOrder(
  payload: PlaceOrderPayload,
  fetchWithAuth: FetchWithAuth,
  booking: Booking | null = null,
): Promise<ProductOrder> {
  if (USE_MOCK) {
    return placeOrderMock(payload)
  }
  const res = await fetchWithAuth('/api/product-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingId: payload.bookingId,
      flightId: payload.flightId,
      cabin: payload.cabin,
      // The server prices the lines; the client sends only what was chosen.
      lines: payload.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        bookingPassengerId: l.category === 'meal' ? l.passengerId : null,
      })),
    }),
  })
  if (!res.ok) {
    throw await parseError(res)
  }
  return toOrder((await res.json()) as OrderWire, booking)
}

// Stands in for F5 until its payment screen exists: reports the payment of an order as paid or failed.
export async function reportPayment(orderId: string, status: 'paid' | 'failed', fetchWithAuth: FetchWithAuth): Promise<void> {
  if (USE_MOCK) {
    if (status === 'paid') await confirmOrderMock(orderId)
    return
  }
  const res = await fetchWithAuth('/api/payment-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, status }),
  })
  if (!res.ok) {
    throw await parseError(res)
  }
}
