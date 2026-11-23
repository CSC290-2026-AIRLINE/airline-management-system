import {
  ApiError,
  type ApiErrorPayload,
  type Booking,
  type CabinSetting,
  type FlightRef,
  type PlaceOrderPayload,
  type Product,
  type ProductOrder,
} from './types'

export const demoEnabled = import.meta.env.DEV && import.meta.env.VITE_F12_DEMO_ENABLED === 'true'

type FetchWithAuth = (path: string, init?: RequestInit) => Promise<Response>

type WireOrder = Omit<ProductOrder, 'placedAt' | 'changesAllowedUntil' | 'refundRequestedAt' | 'refundId' | 'lines'> & {
  createdAt: string
  cutoffAt: string
  lines: Array<
    Omit<ProductOrder['lines'][number], 'unitPrice' | 'passengerId' | 'fulfillmentNote'> & {
      unitPriceAmount: number
      bookingPassengerId: string | null
    }
  >
}

async function request<T>(fetchWithAuth: FetchWithAuth, path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, init)
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'UNKNOWN',
      payload?.error?.message ?? `Request failed with status ${response.status}`,
      payload?.error?.details,
    )
  }
  return (await response.json()) as T
}

function mapOrder(order: WireOrder): ProductOrder {
  return {
    ...order,
    placedAt: order.createdAt,
    changesAllowedUntil: order.cutoffAt,
    refundRequestedAt: null,
    refundId: null,
    lines: order.lines.map((line) => ({
      ...line,
      unitPrice: line.unitPriceAmount,
      passengerId: line.bookingPassengerId,
      fulfillmentNote: line.category === 'duty_free' ? 'Collect on board' : null,
    })),
  }
}

export function fetchBooking(bookingId: string, fetchWithAuth: FetchWithAuth): Promise<Booking> {
  const endpoint = demoEnabled ? 'product-orders/booking' : 'bookings'
  return request(fetchWithAuth, `/api/${endpoint}/${encodeURIComponent(bookingId)}`)
}

export async function fetchProductOrdersForBooking(bookingId: string, fetchWithAuth: FetchWithAuth): Promise<ProductOrder[]> {
  const orders = await request<WireOrder[]>(fetchWithAuth, `/api/product-orders?bookingId=${encodeURIComponent(bookingId)}`)
  return orders.map(mapOrder)
}

export async function cancelProductOrder(orderId: string, fetchWithAuth: FetchWithAuth): Promise<ProductOrder> {
  return mapOrder(await request<WireOrder>(fetchWithAuth, `/api/product-orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' }))
}

interface WireCatalog {
  complimentarySnackAvailable: boolean
  settings: CabinSetting
  cutoffAt: string
  currency: string
  products: Array<
    Pick<Product, 'id' | 'category' | 'typeCode' | 'name' | 'isPremium'> & {
      description: string | null
      priceAmount: number
      availableQuantity: number
    }
  >
}

export async function fetchCatalog(flight: FlightRef, fetchWithAuth: FetchWithAuth) {
  const params = new URLSearchParams({ flightId: flight.id, cabin: flight.cabinClass })
  const catalog = await request<WireCatalog>(fetchWithAuth, `/api/catalog?${params}`)
  const products: Product[] = catalog.products
    .filter((product) => {
      if (product.availableQuantity <= 0) return false
      const { settings } = catalog
      if (product.category === 'meal') {
        return (
          settings.mealService !== 'none' &&
          (settings.mealSelection !== 'fixed' || product.typeCode !== 'STD') &&
          (settings.premiumMealsAllowed || !product.isPremium)
        )
      }
      if (product.category === 'snack' || product.category === 'beverage') return settings.snacksEnabled
      if (product.category === 'duty_free') return settings.dutyFreeEnabled
      return true
    })
    .map((product) => ({
      ...product,
      description: product.description ?? '',
      unitPrice: product.priceAmount,
      thumbnailColor: '#f5f5f7',
      imageUrl: null,
      isDefaultChoice: false,
    }))
  return {
    products,
    setting: catalog.settings,
    cutoffAt: catalog.cutoffAt,
    currency: catalog.currency,
    complimentarySnackAvailable: catalog.complimentarySnackAvailable,
  }
}

export async function placeOrder(payload: PlaceOrderPayload, fetchWithAuth: FetchWithAuth): Promise<ProductOrder> {
  return mapOrder(
    await request<WireOrder>(fetchWithAuth, '/api/product-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  )
}

export async function resolveDemoPayment(orderId: string, status: 'paid' | 'failed', fetchWithAuth: FetchWithAuth): Promise<ProductOrder> {
  return mapOrder(
    await request<WireOrder>(fetchWithAuth, `/api/product-orders/${encodeURIComponent(orderId)}/demo-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
  )
}
