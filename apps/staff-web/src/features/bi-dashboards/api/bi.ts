import { useAppAuth } from '@staff-web/auth/AuthProvider'

/* Response shapes from apps/backend/src/modules/bi-dashboards. Keep them in step with the backend DTOs. */

export interface BiRun {
  id: string
  trigger: 'scheduled' | 'manual'
  status: 'running' | 'success' | 'failed'
  data_as_of: string
  finished_at: string | null
  row_count: number | null
  error_message: string | null
}

export interface BiStatus {
  latest_success: BiRun | null
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

export type BiChartName = 'on-time' | 'load-factor' | 'revenue-per-seat' | 'bookings' | 'delay-causes'

/** Date range and route filter. An empty string means "not set". */
export interface BiFilters {
  from: string
  to: string
  routeId: string
}

export function filterQuery(filters: BiFilters, options: { withRoute?: boolean } = {}): string {
  const params = new URLSearchParams()
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (options.withRoute !== false && filters.routeId) params.set('route_id', filters.routeId)
  return params.toString()
}

/**
 * Calls to `/api/bi/*`. The helpers are rebuilt on every render (as `fetchWithAuth` is), so callers keep them out of
 * effect dependency lists and rely on the request key instead.
 */
export function useBiApi() {
  const { fetchWithAuth } = useAppAuth()

  async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`${res.status}${body ? `: ${body}` : ''}`)
    }
    return (await res.json()) as T
  }

  return {
    getStatus: () => getJson<BiStatus>('/api/bi/status'),
    getKpis: (filters: BiFilters) => getJson<BiKpisResponse>(`/api/bi/kpis?${filterQuery(filters)}`),
    /* The route table lists every route for the dates, so the route filter is not applied to it. */
    getRoutes: (filters: BiFilters) => getJson<BiRouteRow[]>(`/api/bi/routes?${filterQuery(filters, { withRoute: false })}`),
    refresh: () => getJson<BiRun>('/api/bi/refresh', { method: 'POST' }),
    getChartBlob: async (name: BiChartName, filters: BiFilters): Promise<Blob> => {
      const res = await fetchWithAuth(`/api/bi/charts/${name}?${filterQuery(filters)}`)
      if (!res.ok) throw new Error(`${res.status}`)
      return res.blob()
    },
  }
}
