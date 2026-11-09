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
  }
}
