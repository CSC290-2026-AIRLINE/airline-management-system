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
  const err = (body as { error?: { code?: string; message?: string } } | null)?.error
  if (err?.code) return new CargoApiError(res.status, err.code, err.message ?? res.statusText)
  const message = (body as { message?: unknown } | null)?.message
  return new CargoApiError(res.status, `HTTP_${res.status}`, typeof message === 'string' ? message : res.statusText || 'Request failed')
}

/* ── Types ─────────────────────────────────────────────────────────── */

export interface CommodityType {
  id: string
  code: string
  name: string
  handling_class: string
  min_kg: number
  max_kg: number
  max_piece_kg: number
  is_active: boolean
}

export interface CommodityTypeBody {
  code: string
  name: string
  handling_class: string
  min_kg: number
  max_kg: number
  max_piece_kg: number
  is_active: boolean
}

export interface Rate {
  id: string
  commodity_type_id: string
  commodity_type_name: string
  min_distance_km: number
  max_distance_km: number
  rate_per_kg: number
  min_charge: number
  is_active: boolean
}

export interface RateBody {
  commodity_type_id: string
  min_distance_km: number
  max_distance_km: number
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

export interface CargoSettings {
  [key: string]: unknown
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
    listCommodityTypes: () => send<{ commodity_types: CommodityType[] }>('/api/staff/cargo/commodity-types'),
    createCommodityType: (body: CommodityTypeBody) =>
      send<CommodityType>('/api/staff/cargo/commodity-types', { method: 'POST', body: JSON.stringify(body) }),
    updateCommodityType: (id: string, body: Partial<CommodityTypeBody>) =>
      send<CommodityType>(`/api/staff/cargo/commodity-types/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    listRates: () => send<{ rates: Rate[] }>('/api/staff/cargo/rates'),
    createRate: (body: RateBody) => send<Rate>('/api/staff/cargo/rates', { method: 'POST', body: JSON.stringify(body) }),
    updateRate: (id: string, body: Partial<RateBody>) =>
      send<Rate>(`/api/staff/cargo/rates/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    listProhibitedItems: () => send<{ prohibited_items: ProhibitedItem[] }>('/api/staff/cargo/prohibited-items'),
    createProhibitedItem: (body: ProhibitedItemBody) =>
      send<ProhibitedItem>('/api/staff/cargo/prohibited-items', { method: 'POST', body: JSON.stringify(body) }),
    updateProhibitedItem: (id: string, body: Partial<ProhibitedItemBody>) =>
      send<ProhibitedItem>(`/api/staff/cargo/prohibited-items/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    getSettings: () => send<CargoSettings>('/api/staff/cargo/settings'),
    updateSettings: (body: Partial<CargoSettings>) =>
      send<CargoSettings>('/api/staff/cargo/settings', { method: 'PUT', body: JSON.stringify(body) }),
  }
}
