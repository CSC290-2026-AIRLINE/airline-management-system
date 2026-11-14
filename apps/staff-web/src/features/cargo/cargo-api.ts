import { useAppAuth } from '@staff-web/auth/AuthProvider'

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
    // Not JSON — fall back to the status line below.
  }
  const obj = body as Record<string, unknown> | null
  const err = (obj?.error as { code?: string; message?: string } | undefined) ?? undefined
  if (err?.code) return new CargoApiError(res.status, err.code, err.message ?? res.statusText)
  const message = obj?.message
  if (Array.isArray(message)) return new CargoApiError(res.status, `HTTP_${res.status}`, message.join(', '))
  if (typeof message === 'string') return new CargoApiError(res.status, `HTTP_${res.status}`, message)
  return new CargoApiError(res.status, `HTTP_${res.status}`, res.statusText || 'Request failed')
}

/* ── Desk types ───────────────────────────────────────────────────── */

export interface DeskBooking {
  id: string
  bookingRef: string
  awbNumber: string | null
  shipperName: string
  consigneeName: string
  flightNumber: string
  flightServiceDate: string
  commodityTypeName: string
  pieces: number
  quotedChargeableKg: number
  quotedCharge: number
  currency: string
  status: string
  bookedAt: string
}

export interface DeskListResult {
  data: DeskBooking[]
  counts: Record<string, number>
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface TestToolResult {
  created?: { ref: string; awb: string | null }[]
  failed?: { index: number; reason: string }[]
  error?: string
}

export interface BookingDetail {
  header: {
    id: string
    bookingRef: string
    awbNumber: string | null
    currentStatus: string
    quotedCharge: number
    currency: string
    paymentId: string | null
  }
  goods: {
    pieces: number
    declaredWeightKg: number
    declaredVolumeM3: number
    goodsDescription: string
    commodityTypeName: string
    handlingClass: string
    unNumber: string | null
    measured: { weightKg: number | null; volumeM3: number | null; chargeableKg: number | null } | null
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
    destination: string
    freeKg: number
  }
  shipper: { name: string; phone: string | null }
  consignee: { name: string; address: string; phone: string | null }
  timeline: TimelineEvent[]
  notices: BookingNotice[]
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
  measuredWeightKg: number | null
  measuredVolumeM3: number | null
  measuredChargeableKg: number | null
  refundId: string | null
}

export interface BookingNotice {
  id: string
  title: string
  message: string
  notifiedAt: string
  readAt: string | null
}

/* ── Types ─────────────────────────────────────────────────────────── */

export interface CommodityType {
  id: string
  code: string
  name: string
  handling_class: string
  min_weight_kg: number
  max_weight_kg: number
  max_piece_weight_kg: number
  is_active: boolean
}

export interface CommodityTypeBody {
  code: string
  name: string
  handling_class: string
  min_weight_kg: number
  max_weight_kg: number
  max_piece_weight_kg: number
  is_active: boolean
}

export interface Rate {
  id: string
  commodity_type_id: string
  cargo_commodity_type: { id: string; name: string }
  min_distance_km: number
  max_distance_km: number | null
  rate_per_kg: string | number
  min_charge: string | number
  is_active: boolean
}

export interface RateBody {
  commodity_type_id: string
  min_distance_km: number
  max_distance_km: number | null
  rate_per_kg: number
  min_charge: number
  is_active?: boolean
}

export interface ProhibitedItem {
  id: string
  keyword: string
  reason: string
  is_active: boolean
}

export interface ProhibitedItemBody {
  keyword: string
  reason: string
  is_active?: boolean
}

export interface CargoSettingRow {
  key: string
  value: string
  updated_at?: string
  updated_by?: string
}

export type CargoSettings = Record<string, string>

/* ── Flight cargo types ───────────────────────────────────────────── */

export interface FlightWithCargo {
  id: string
  flightNumber: string
  serviceDate: string
  depAt: string
  aircraft: string
  status: string
  bookingCount: number
  committedKg: number
  availableKg: number
}

export interface ManifestRow {
  id: string
  awbNumber: string | null
  shipperName: string
  consigneeName: string
  commodityTypeName: string
  handlingClass: string
  pieces: number
  declaredWeightKg: number
  measuredWeightKg: number | null
  status: string
}

export interface FlightManifest {
  flightNumber: string
  serviceDate: string
  holdLimitKg: number
  committedKg: number
  availableKg: number
  totalDeclaredKg: number
  totalMeasuredKg: number
  loadedCount: number
  bookedCount: number
  rows: ManifestRow[]
}

/* ── Claim types ──────────────────────────────────────────────────── */

export interface ClaimDecisionSummary {
  decision: string
  approvedAmount: number | null
  decidedAt: string
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
  decision: ClaimDecisionSummary | null
}

export interface ClaimListResult {
  data: ClaimListItem[]
  counts: { open: number; decided: number; all: number }
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface ClaimDetail {
  id: string
  claimRef: string
  claimType: string
  piecesAffected: number
  totalPieces: number
  description: string
  claimedAmount: number
  currency: string
  filedAt: string
  status: string
  decision: {
    decision: string
    approvedAmount: number | null
    note: string
    decidedAt: string
    decidedBy: string
  } | null
  booking: {
    id: string
    bookingRef: string
    awbNumber: string | null
    shipperName: string
    consigneeName: string
    flightNumber: string
    flightServiceDate: string
    commodityTypeName: string
    pieces: number
    charge: number
    currency: string
  }
  timeline: TimelineEvent[]
}

export interface TestClaimResult {
  claimRef?: string
  claimId?: string
  error?: { code: string; message: string }
}

/* ── Hook ──────────────────────────────────────────────────────────── */

export function useCargoApi() {
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
    listCommodityTypes: () => send<CommodityType[]>('/api/staff/cargo/commodity-types'),
    createCommodityType: (body: CommodityTypeBody) =>
      send<CommodityType>('/api/staff/cargo/commodity-types', { method: 'POST', body: JSON.stringify(body) }),
    updateCommodityType: (id: string, body: Partial<CommodityTypeBody>) =>
      send<CommodityType>(`/api/staff/cargo/commodity-types/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    listRates: () => send<Rate[]>('/api/staff/cargo/rates'),
    createRate: (body: RateBody) => send<Rate>('/api/staff/cargo/rates', { method: 'POST', body: JSON.stringify(body) }),
    updateRate: (id: string, body: Partial<RateBody>) =>
      send<Rate>(`/api/staff/cargo/rates/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    listProhibitedItems: () => send<ProhibitedItem[]>('/api/staff/cargo/prohibited-items'),
    createProhibitedItem: (body: ProhibitedItemBody) =>
      send<ProhibitedItem>('/api/staff/cargo/prohibited-items', { method: 'POST', body: JSON.stringify(body) }),
    updateProhibitedItem: (id: string, body: Partial<ProhibitedItemBody>) =>
      send<ProhibitedItem>(`/api/staff/cargo/prohibited-items/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    getSettings: async (): Promise<CargoSettings> => {
      const rows = await send<CargoSettingRow[]>('/api/staff/cargo/settings')
      const map: CargoSettings = {}
      for (const row of rows) map[row.key] = row.value
      return map
    },
    updateSettings: async (body: CargoSettings): Promise<CargoSettings> => {
      const settings = Object.entries(body).map(([key, value]) => ({ key, value: Number(value) }))
      const rows = await send<CargoSettingRow[]>('/api/staff/cargo/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings }),
      })
      const map: CargoSettings = {}
      for (const row of rows) map[row.key] = row.value
      return map
    },

    listBookings: (params: { status?: string; q?: string; page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams()
      if (params.status && params.status !== 'all') qs.set('status', params.status)
      if (params.q) qs.set('q', params.q)
      if (params.page) qs.set('page', String(params.page))
      if (params.pageSize) qs.set('page_size', String(params.pageSize))
      const query = qs.toString()
      return send<DeskListResult>(`/api/staff/cargo/bookings${query ? `?${query}` : ''}`)
    },

    getBookingDetail: (id: string) => send<BookingDetail>(`/api/staff/cargo/bookings/${id}`),

    acceptBooking: (id: string, body: { measured_weight_kg: number; measured_volume_m3: number }) =>
      send<{ status: string }>(`/api/staff/cargo/bookings/${id}/acceptance`, { method: 'PUT', body: JSON.stringify(body) }),
    rejectBooking: (id: string, body: { measured_weight_kg: number; measured_volume_m3: number; reason: string }) =>
      send<{ status: string; refundId: string }>(`/api/staff/cargo/bookings/${id}/rejection`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    postEvent: (id: string, body: { event: string; note?: string }) =>
      send<{ status: string; refundId?: string }>(`/api/staff/cargo/bookings/${id}/events`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    createTestFlights: () => send<{ created?: string[]; error?: string }>('/api/staff/cargo/test/flights', { method: 'POST' }),
    createTestBookings: (count = 1) =>
      send<TestToolResult>('/api/staff/cargo/test/bookings', { method: 'POST', body: JSON.stringify({ count }) }),
    simulateDeparture: (id: string) => send<{ status: string }>(`/api/staff/cargo/test/bookings/${id}/departed`, { method: 'POST' }),
    simulateArrival: (id: string) => send<{ status: string }>(`/api/staff/cargo/test/bookings/${id}/arrived`, { method: 'POST' }),

    listFlightsWithCargo: (from: string, to: string) =>
      send<FlightWithCargo[]>(`/api/staff/cargo/flights?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    getFlightManifest: (flightId: string) => send<FlightManifest>(`/api/staff/cargo/flights/${flightId}/manifest`),

    listClaims: (params: { status?: string; q?: string; page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams()
      if (params.status && params.status !== 'all') qs.set('status', params.status)
      if (params.q) qs.set('q', params.q)
      if (params.page) qs.set('page', String(params.page))
      if (params.pageSize) qs.set('page_size', String(params.pageSize))
      const query = qs.toString()
      return send<ClaimListResult>(`/api/staff/cargo/claims${query ? `?${query}` : ''}`)
    },
    getClaimDetail: (id: string) => send<ClaimDetail>(`/api/staff/cargo/claims/${id}`),
    decideClaim: (id: string, body: { decision: string; approved_amount?: number; note: string }) =>
      send<{ decision: string }>(`/api/staff/cargo/claims/${id}/decision`, { method: 'POST', body: JSON.stringify(body) }),
    fileTestClaim: (bookingId: string) => send<TestClaimResult>(`/api/staff/cargo/test/bookings/${bookingId}/claim`, { method: 'POST' }),
  }
}
