// API clients for the Booking Details page and the Add Extra Services
// page. All functions take `fetchWithAuth` as a parameter so the module
// is pure and easy to swap when TanStack Query is wired up later. The
// hook lives in apps/customer-web/src/auth/AuthProvider.tsx and already
// handles the 401 → refresh dance.
//
// In development (`import.meta.env.DEV === true`) the calls are routed
// to the in-memory mocks in `./api.dev`. The mock branch is dropped by
// the bundler in production builds, so no mock data ships.

import {
  cancelProductOrderMock,
  confirmOrderMock,
  fetchBookingMock,
  fetchCabinSettingMock,
  fetchCatalogMock,
  fetchProductOrdersForBookingMock,
  placeOrderMock,
} from './api.dev'
import {
  ApiError,
  type ApiErrorPayload,
  type Booking,
  type CabinSetting,
  type PlaceOrderPayload,
  type Product,
  type ProductOrder,
} from './types'

type FetchWithAuth = (path: string, init?: RequestInit) => Promise<Response>

const USE_MOCK = import.meta.env.DEV

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

export async function fetchBooking(bookingId: string, fetchWithAuth: FetchWithAuth): Promise<Booking> {
  if (USE_MOCK) {
    return fetchBookingMock()
  }
  void bookingId
  void fetchWithAuth
  const res = await fetchWithAuth(`/api/bookings/${encodeURIComponent(bookingId)}`)
  if (!res.ok) {
    throw await parseError(res)
  }
  return (await res.json()) as Booking
}

export async function fetchProductOrdersForBooking(
  bookingId: string,
  fetchWithAuth: FetchWithAuth,
  preset?: 'ready' | 'duty-free' | 'waiting' | 'failed' | 'confirmed' | 'cancel-po-2041' | 'refund-requested',
): Promise<ProductOrder[]> {
  if (USE_MOCK) {
    return fetchProductOrdersForBookingMock(preset)
  }
  void bookingId
  void fetchWithAuth
  void preset
  const res = await fetchWithAuth(`/api/product-orders?bookingId=${encodeURIComponent(bookingId)}`)
  if (!res.ok) {
    throw await parseError(res)
  }
  // The endpoint may return either a bare array or `{ orders: [...] }`.
  // Accept both to stay resilient to the eventual backend contract.
  const data: unknown = await res.json()
  if (Array.isArray(data)) {
    return data as ProductOrder[]
  }
  if (data && typeof data === 'object' && 'orders' in data && Array.isArray((data as { orders: unknown }).orders)) {
    return (data as { orders: ProductOrder[] }).orders
  }
  return []
}

export async function cancelProductOrder(orderId: string, fetchWithAuth: FetchWithAuth): Promise<ProductOrder> {
  if (USE_MOCK) {
    return cancelProductOrderMock(orderId)
  }
  void fetchWithAuth
  const res = await fetchWithAuth(`/api/product-orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
  })
  if (!res.ok) {
    throw await parseError(res)
  }
  return (await res.json()) as ProductOrder
}

// --- Page 2 endpoints -------------------------------------------------

export async function fetchCatalog(flightId: string, fetchWithAuth: FetchWithAuth): Promise<Product[]> {
  if (USE_MOCK) {
    return fetchCatalogMock(flightId)
  }
  void fetchWithAuth
  const res = await fetchWithAuth(`/api/flights/${encodeURIComponent(flightId)}/catalog`)
  if (!res.ok) {
    throw await parseError(res)
  }
  const data: unknown = await res.json()
  if (Array.isArray(data)) return data as Product[]
  if (data && typeof data === 'object' && 'products' in data && Array.isArray((data as { products: unknown }).products)) {
    return (data as { products: Product[] }).products
  }
  return []
}

export async function fetchCabinSetting(flightId: string, fetchWithAuth: FetchWithAuth): Promise<CabinSetting> {
  if (USE_MOCK) {
    return fetchCabinSettingMock(flightId)
  }
  void fetchWithAuth
  const res = await fetchWithAuth(`/api/flights/${encodeURIComponent(flightId)}/cabin-setting`)
  if (!res.ok) {
    throw await parseError(res)
  }
  return (await res.json()) as CabinSetting
}

// Creates a new product_order in `pending_payment` state. The server is
// expected to reserve stock and return the order with the new id. The
// caller is then responsible for either (a) hitting F5 to confirm, or
// (b) calling `confirmOrder` for the $0 short-circuit.
export async function placeOrder(payload: PlaceOrderPayload, fetchWithAuth: FetchWithAuth): Promise<ProductOrder> {
  if (USE_MOCK) {
    return placeOrderMock(payload)
  }
  void fetchWithAuth
  const res = await fetchWithAuth('/api/product-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw await parseError(res)
  }
  return (await res.json()) as ProductOrder
}

// Dev-only: confirms a pending_payment order without going through F5.
// In production this would be triggered by the F5 callback, not the
// client, so this function is intentionally not exported from the
// real-API branch.
export async function confirmOrderDev(orderId: string, fetchWithAuth: FetchWithAuth): Promise<ProductOrder> {
  if (USE_MOCK) {
    return confirmOrderMock(orderId)
  }
  void fetchWithAuth
  throw new ApiError(501, 'NOT_IMPLEMENTED', 'confirmOrder is a dev-only mock helper')
}
