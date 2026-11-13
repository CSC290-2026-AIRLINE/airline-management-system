import { useAppAuth } from '@staff-web/auth/AuthProvider'

/* Response shapes from apps/backend/src/modules/bi-dashboards. Keep them in step with the backend DTOs. */

export interface BiRun {
  id: string
  trigger: 'scheduled' | 'manual'
  status: 'running' | 'success' | 'failed'
  data_as_of: string
  started_at: string
  finished_at: string | null
  row_count: number | null
  error_message: string | null
}

export interface BiStatus {
  simulation_now?: string
  latest_success: BiRun | null
  last_run: BiRun | null
  refreshing: boolean
}

export interface BiKpis {
  flight_count: number
  cancelled_count: number
  departed_count: number
  on_time_count: number
  delay_minutes: number
  seat_available: number
  seat_sold: number
  revenue_amount: number
  refund_amount: number
  on_time_pct: number | null
  load_factor: number | null
  revenue_per_seat: number | null
}

export interface BiDailyRow extends BiKpis {
  flight_date: string
}

export interface BiRouteRow extends BiKpis {
  route_id: string
  origin: string
  destination: string
}

export interface BiKpisResponse {
  kpis: BiKpis
  daily: BiDailyRow[]
}

export interface BiPeriodRow extends BiKpis {
  period: string
}

export interface BiCabinRow {
  cabin: string
  label: string
  seat_sold: number
  seat_available: number
  load_factor: number | null
}

export interface BiPeriodBookings {
  period: string
  bookings: number
  cancellations: number
}

export interface BiBookingRouteRow {
  booking_date: string
  origin: string
  destination: string
  booking_count: number
  cancellation_count: number
}

export interface BiDelayCause {
  category: string
  events: number
  delay_minutes: number
}

export interface BiFlight {
  flight_number: string
  flight_date: string
  route: string
  status: string
  delay_minutes: number | null
  cause: string | null
  seat_sold: number
  seat_available: number
  /** Null when a cabin is chosen: revenue is per flight only. */
  revenue: number | null
}

export interface BiFinanceMonth {
  month: string
  revenue: number
  pass_through: number
  refund: number
  maintenance: number
  staff: number
  catering: number
  other: number
  costs: number
  profit: number
  margin_pct: number | null
  computed_at: string
  partial: boolean
}

export interface BiScheduledPayment {
  id: string
  payee: string
  description: string | null
  amount: number
  due_date: string
  status: 'scheduled'
}

export interface BiFinanceResponse {
  current: BiFinanceMonth | null
  previous: BiFinanceMonth | null
  months: string[]
}

export type BiChartName = 'on-time' | 'load-factor' | 'revenue-per-seat' | 'bookings' | 'delay-causes' | 'cabins'
export type BiGroup = 'day' | 'week' | 'month'
export type BiRevenueMode = 'after_refunds' | 'before_refunds'
export type BiCabin = 'economy' | 'premium_economy' | 'business' | 'first'

/** Every filter the BI screens can set. An empty string or undefined means "not set". */
export interface BiFilters {
  from: string
  to: string
  routeId: string
  group: BiGroup
  revenueMode: BiRevenueMode
  cabin?: BiCabin
  cause?: string
  departedOnly?: boolean
}

export const NO_FILTERS: BiFilters = { from: '', to: '', routeId: '', group: 'day', revenueMode: 'after_refunds' }

/** The query string for a set of filters. `withRoute: false` leaves out the route (used by the route table). */
export function filterQuery(filters: BiFilters, options: { withRoute?: boolean } = {}): string {
  const params = new URLSearchParams()
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (options.withRoute !== false && filters.routeId) params.set('route_id', filters.routeId)
  params.set('group', filters.group)
  params.set('revenue_mode', filters.revenueMode)
  if (filters.cabin) params.set('cabin', filters.cabin)
  if (filters.cause) params.set('cause', filters.cause)
  if (filters.departedOnly === false) params.set('departed_only', 'false')
  return params.toString()
}

/**
 * Calls to `/api/bi/*`. The helpers are rebuilt on every render (as `fetchWithAuth` is), so callers keep them out of
 * effect dependency lists and rely on the request key instead.
 */
export function useBiApi() {
  const { fetchWithAuth } = useAppAuth()

  async function getResponse(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetchWithAuth(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`${res.status}${body ? `: ${body}` : ''}`)
    }
    return res
  }

  async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
    return (await (await getResponse(path, init)).json()) as T
  }

  return {
    getStatus: () => getJson<BiStatus>('/api/bi/status'),
    getKpis: (filters: BiFilters) => getJson<BiKpisResponse>(`/api/bi/kpis?${filterQuery(filters)}`),
    /* The route table lists every route for the dates, so the route filter is not applied to it. */
    getRoutes: (filters: BiFilters) => getJson<BiRouteRow[]>(`/api/bi/routes?${filterQuery(filters, { withRoute: false })}`),
    getSeries: (filters: BiFilters) => getJson<BiPeriodRow[]>(`/api/bi/series?${filterQuery(filters)}`),
    getCabins: (filters: BiFilters) => getJson<BiCabinRow[]>(`/api/bi/cabins?${filterQuery(filters)}`),
    getBookingsSeries: (filters: BiFilters) => getJson<BiPeriodBookings[]>(`/api/bi/bookings-series?${filterQuery(filters)}`),
    getBookingsByRoute: (filters: BiFilters) =>
      getJson<BiBookingRouteRow[]>(`/api/bi/bookings?${filterQuery(filters)}`),
    getDelayCauses: (filters: BiFilters) => getJson<BiDelayCause[]>(`/api/bi/delay-causes?${filterQuery(filters)}`),
    getFlights: (filters: BiFilters) => getJson<BiFlight[]>(`/api/bi/flights?${filterQuery(filters)}`),
    getFinance: (month: string | null) => getJson<BiFinanceResponse>(`/api/bi/finance${month ? `?month=${month}` : ''}`),
    getFinancePayments: () => getJson<BiScheduledPayment[]>('/api/bi/finance/payments'),
    refresh: () => getJson<BiRun>('/api/bi/refresh', { method: 'POST' }),
    getChartBlob: async (name: BiChartName, filters: BiFilters): Promise<Blob> => {
      const res = await getResponse(`/api/bi/charts/${name}?${filterQuery(filters)}`)
      return res.blob()
    },
    /** Downloads a CSV from the API with the login token, and saves it under the given file name. */
    downloadCsv: async (path: string, fileName: string): Promise<void> => {
      const res = await getResponse(path)
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)
    },
  }
}
