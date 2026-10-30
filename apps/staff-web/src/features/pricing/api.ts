import { useAppAuth } from '@staff-web/auth/AuthProvider'

// Mirrors CABINS in the backend's pricing.constants.ts.
export const CABINS = ['economy', 'premium_economy', 'business', 'first'] as const
export type Cabin = (typeof CABINS)[number]

// Prisma sends NUMERIC columns as strings ("150.00"); read them with Number().
type Decimal = string | number

export interface FareClass {
  id: string
  code: string
  cabin: Cabin
  name: string
  min_advance_purchase_days: number
  refundable: boolean
  changeable: boolean
  cancel_fee_flat: Decimal
  cancel_fee_pct: Decimal
  change_fee_flat: Decimal
  change_fee_pct: Decimal
  is_active: boolean
}

export type FareClassInput = Omit<FareClass, 'id' | 'cancel_fee_flat' | 'cancel_fee_pct' | 'change_fee_flat' | 'change_fee_pct'> & {
  cancel_fee_flat: number
  cancel_fee_pct: number
  change_fee_flat: number
  change_fee_pct: number
}

export interface RouteOption {
  id: string
  origin: string
  destination: string
}

export interface BaseFare {
  id: string
  route_id: string
  fare_class_id: string
  amount: Decimal
}

interface PricingSetting {
  key: string
  value: string
}

// Body of every pricing error is { code, message, details? }; ValidationPipe errors carry message: string[].
export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export function jsonInit(method: Method, body?: unknown): RequestInit {
  return { method, ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
}

// Turns a response into its JSON body, or throws ApiError with the backend's message and code.
export async function readResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as T
  }
  const data = (await res.json().catch(() => null)) as { message?: string | string[]; code?: string } | null
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join('; ') : (data?.message ?? `Request failed (${res.status})`)
    throw new ApiError(message, res.status, data?.code)
  }
  return data as T
}

// Calls go through AuthProvider's fetchWithAuth (token + refresh). No caching here: TanStack Query replaces this once
// the Dev Leads add the shared setup.
export function usePricingApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
    return readResponse<T>(await fetchWithAuth(`/api/staff${path}`, jsonInit(method, body)))
  }

  return {
    listFareClasses: (includeInactive: boolean) => request<FareClass[]>(`/fare-classes${includeInactive ? '?include_inactive=true' : ''}`),
    createFareClass: (input: FareClassInput) => request<FareClass>('/fare-classes', 'POST', input),
    updateFareClass: (id: string, input: FareClassInput) => request<FareClass>(`/fare-classes/${id}`, 'PATCH', input),
    deleteFareClass: (id: string) => request<void>(`/fare-classes/${id}`, 'DELETE'),

    listRouteOptions: () => request<RouteOption[]>('/base-fares/route-options'),
    listBaseFares: (routeId: string) => request<BaseFare[]>(`/base-fares?route_id=${encodeURIComponent(routeId)}`),
    createBaseFare: (routeId: string, fareClassId: string, amount: number) =>
      request<BaseFare>('/base-fares', 'POST', { route_id: routeId, fare_class_id: fareClassId, amount }),
    updateBaseFare: (id: string, amount: number) => request<BaseFare>(`/base-fares/${id}`, 'PATCH', { amount }),
    deleteBaseFare: (id: string) => request<void>(`/base-fares/${id}`, 'DELETE'),

    getBaseCurrency: async () => {
      const settings = await request<PricingSetting[]>('/settings')
      return settings.find((setting) => setting.key === 'base_currency')?.value ?? 'THB'
    },
  }
}
