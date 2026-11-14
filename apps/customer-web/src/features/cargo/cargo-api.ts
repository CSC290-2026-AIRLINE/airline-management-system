import { useAppAuth } from '@customer-web/auth/AuthProvider'

export class CargoApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'CargoApiError'
    this.status = status
    this.code = code
  }
}

async function readError(res: Response): Promise<CargoApiError> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // Not JSON
  }
  const obj = body as Record<string, unknown> | null
  const err = (obj?.error as { code?: string; message?: string } | undefined) ?? undefined
  if (err?.code) return new CargoApiError(res.status, err.code, err.message ?? res.statusText)
  const message = obj?.message
  if (Array.isArray(message)) return new CargoApiError(res.status, `HTTP_${res.status}`, message.join(', '))
  if (typeof message === 'string') return new CargoApiError(res.status, `HTTP_${res.status}`, message)
  return new CargoApiError(res.status, `HTTP_${res.status}`, res.statusText || 'Request failed')
}

/* ── Types ──────────────────────────────────────────────────────────── */

export interface CargoRoute {
  id: string
  origin: string
  originName: string
  destination: string
  destinationName: string
  distanceKm: number
}

export interface CommodityType {
  id: string
  code: string
  name: string
  handlingClass: string
  minWeightKg: number
  maxWeightKg: number
  maxPieceWeightKg: number
}

export interface QuoteResult {
  flightNumber: string
  depAt: string
  arrAt: string
  distanceKm: number
  chargeableKg: number
  ratePerKg: number
  minCharge: number
  charge: number
  currency: string
}

export interface CreateBookingResult {
  id: string
  bookingRef: string
  flightId: string
  amountDue: number
  currency: string
  holdExpiresAt: string
}

export interface MyBooking {
  id: string
  bookingRef: string
  awbNumber: string | null
  origin: string
  destination: string
  flightNumber: string
  shipDate: string
  commodityTypeName: string
  pieces: number
  charge: number
  currency: string
  status: string
  bookedAt: string
}

export interface MyBookingListResult {
  data: MyBooking[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface TimelineEvent {
  id: string
  occurredAt: string
  eventType: string
  statusBefore: string | null
  statusAfter: string
  actorType: string
  flightId: string
  airportCode: string | null
  note: string | null
}

export interface ClaimDecision {
  decision: string
  approvedAmount: number | null
  note: string
  decidedAt: string
}

export interface BookingClaim {
  id: string
  claimRef: string
  claimType: string
  piecesAffected: number
  description: string
  claimedAmount: number
  currency: string
  filedAt: string
  decision: ClaimDecision | null
}

export interface BookingDetail {
  id: string
  bookingRef: string
  awbNumber: string | null
  status: string
  holdExpiresAt: string
  goods: {
    pieces: number
    declaredWeightKg: number
    declaredVolumeM3: number
    goodsDescription: string
    commodityTypeName: string
    handlingClass: string
    unNumber: string | null
  }
  quote: {
    distanceKm: number
    chargeableKg: number
    ratePerKg: number
    minCharge: number
    charge: number
    currency: string
  }
  flight: {
    id: string
    flightNumber: string
    serviceDate: string
    scheduledDepAt: string
    scheduledArrAt: string
    depAt: string
    arrAt: string
    status: string
    origin: string
    originName: string
    destination: string
    destinationName: string
  }
  shipper: { name: string; phone: string | null }
  consignee: { name: string; address: string; phone: string | null }
  timeline: TimelineEvent[]
  claim: BookingClaim | null
  mock_payment_available?: boolean
}

export interface ClaimListItem {
  id: string
  claimRef: string
  bookingRef: string
  awbNumber: string | null
  claimType: string
  piecesAffected: number
  claimedAmount: number
  currency: string
  filedAt: string
  decision: { decision: string; approvedAmount: number | null; decidedAt: string } | null
}

export interface ClaimListResult {
  data: ClaimListItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface MockPayResult {
  awbNumber?: string
  error?: { code: string; message: string }
}

export interface NoticeItem {
  id: string
  bookingId: string
  bookingRef: string
  title: string
  message: string
  notifiedAt: string
  readAt: string | null
}

export interface NoticeListResult {
  data: NoticeItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  unreadCount: number
}

/* ── Hook ───────────────────────────────────────────────────────────── */

export function useCustomerCargoApi() {
  const { fetchWithAuth } = useAppAuth()

  async function send<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) throw await readError(res)
    return (await res.json()) as T
  }

  return {
    listRoutes: () => send<CargoRoute[]>('/api/cargo/routes'),
    listCommodityTypes: () => send<CommodityType[]>('/api/cargo/commodity-types'),

    getQuote: (body: {
      route_id: string
      ship_date: string
      commodity_type_id: string
      pieces: number
      weight_kg: number
      volume_m3: number
      description: string
      un_number?: string
    }) => send<QuoteResult>('/api/cargo/quotes', { method: 'POST', body: JSON.stringify(body) }),

    createBooking: (body: {
      route_id: string
      ship_date: string
      commodity_type_id: string
      pieces: number
      weight_kg: number
      volume_m3: number
      description: string
      un_number?: string
      shipper_company: string
      shipper_phone?: string
      consignee_name: string
      consignee_address: string
      consignee_phone?: string
    }) => send<CreateBookingResult>('/api/cargo/bookings', { method: 'POST', body: JSON.stringify(body) }),

    listMyBookings: (params: { status?: string; page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams()
      if (params.status && params.status !== 'all') qs.set('status', params.status)
      if (params.page) qs.set('page', String(params.page))
      if (params.pageSize) qs.set('page_size', String(params.pageSize))
      const query = qs.toString()
      return send<MyBookingListResult>(`/api/cargo/bookings${query ? `?${query}` : ''}`)
    },

    getBookingDetail: (id: string) => send<BookingDetail>(`/api/cargo/bookings/${id}`),
    cancelBooking: (id: string) => send<{ status: string; refundId?: string }>(`/api/cargo/bookings/${id}`, { method: 'DELETE' }),
    mockPay: (id: string) => send<MockPayResult>(`/api/cargo/bookings/${id}/mock-pay`, { method: 'POST' }),

    fileClaim: (bookingId: string, body: { claim_type: string; pieces_affected: number; description: string; claimed_amount: number }) =>
      send<{ id: string; claimRef: string }>(`/api/cargo/bookings/${bookingId}/claims`, { method: 'POST', body: JSON.stringify(body) }),

    listMyClaims: (params: { page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams()
      if (params.page) qs.set('page', String(params.page))
      if (params.pageSize) qs.set('page_size', String(params.pageSize))
      const query = qs.toString()
      return send<ClaimListResult>(`/api/cargo/claims${query ? `?${query}` : ''}`)
    },

    listMyNotices: (params: { unread?: boolean; page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams()
      if (params.unread !== undefined) qs.set('unread', String(params.unread))
      if (params.page) qs.set('page', String(params.page))
      if (params.pageSize) qs.set('page_size', String(params.pageSize))
      const query = qs.toString()
      return send<NoticeListResult>(`/api/cargo/notices${query ? `?${query}` : ''}`)
    },
    markNoticeRead: (id: string) => send<{ id: string; readAt: string }>(`/api/cargo/notices/${id}`, { method: 'PUT' }),
  }
}
