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
  origin_city: string
  destination_city: string
}

export interface BaseFare {
  id: string
  route_id: string
  fare_class_id: string
  amount: Decimal
}

// Mirrors RULE_GROUPS in the backend's pricing.constants.ts, in the order the engine applies them.
export const RULE_GROUPS = ['urgency', 'load', 'month', 'period'] as const
export type RuleGroup = (typeof RULE_GROUPS)[number]

export interface PricingRule {
  id: string
  rule_group: RuleGroup
  name: string
  priority: number
  min_days_out: number | null
  max_days_out: number | null
  min_seats_left_pct: Decimal | null
  max_seats_left_pct: Decimal | null
  month: number | null
  start_date: string | null // ISO timestamp at UTC midnight
  end_date: string | null
  fare_class_id: string | null
  fare_class: { code: string; name: string } | null
  adjustment_pct: Decimal
  is_active: boolean
}

// Body of POST /staff/pricing-rules: only the condition fields of the rule's own group are sent.
export interface NewPricingRule {
  rule_group: RuleGroup
  name: string
  adjustment_pct: number
  min_days_out?: number
  max_days_out?: number
  min_seats_left_pct?: number
  max_seats_left_pct?: number
  month?: number
  start_date?: string // YYYY-MM-DD
  end_date?: string
}

// Mirrors SEAT_TYPES in the backend's pricing.constants.ts.
export const SEAT_TYPES = ['normal', 'exit_row', 'extra_legroom'] as const
export type SeatType = (typeof SEAT_TYPES)[number]

export interface SeatFee {
  id: string
  cabin: Cabin
  seat_type: SeatType
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

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

// Calls go through AuthProvider's fetchWithAuth (token + refresh). No caching here: TanStack Query replaces this once
// the Dev Leads add the shared setup.
export function usePricingApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
    const res = await fetchWithAuth(`/api/staff${path}`, {
      method,
      ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
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

  return {
    listFareClasses: (includeInactive: boolean) => request<FareClass[]>(`/fare-classes${includeInactive ? '?include_inactive=true' : ''}`),
    createFareClass: (input: FareClassInput) => request<FareClass>('/fare-classes', 'POST', input),
    updateFareClass: (id: string, input: FareClassInput) => request<FareClass>(`/fare-classes/${id}`, 'PATCH', input),
    deleteFareClass: (id: string) => request<void>(`/fare-classes/${id}`, 'DELETE'),

    listRouteOptions: () => request<RouteOption[]>('/base-fares/route-options'),
    listBaseFares: () => request<BaseFare[]>('/base-fares'),
    createBaseFare: (routeId: string, fareClassId: string, amount: number) =>
      request<BaseFare>('/base-fares', 'POST', { route_id: routeId, fare_class_id: fareClassId, amount }),
    updateBaseFare: (id: string, amount: number) => request<BaseFare>(`/base-fares/${id}`, 'PATCH', { amount }),
    deleteBaseFare: (id: string) => request<void>(`/base-fares/${id}`, 'DELETE'),

    listPricingRules: () => request<PricingRule[]>('/pricing-rules'),
    createPricingRule: (input: NewPricingRule) => request<PricingRule>('/pricing-rules', 'POST', input),
    setPricingRuleActive: (id: string, isActive: boolean) => request<PricingRule>(`/pricing-rules/${id}`, 'PATCH', { is_active: isActive }),
    reorderPricingRules: (group: RuleGroup, ids: string[]) =>
      request<PricingRule[]>('/pricing-rules/reorder', 'POST', { rule_group: group, ids }),
    deletePricingRule: (id: string) => request<void>(`/pricing-rules/${id}`, 'DELETE'),

    // Seat fees belong to Member C's backend (staff/seat-fees); this page only edits the amounts.
    listSeatFees: () => request<SeatFee[]>('/seat-fees'),
    createSeatFee: (cabin: Cabin, seatType: SeatType, amount: number) =>
      request<SeatFee>('/seat-fees', 'POST', { cabin, seat_type: seatType, amount }),
    updateSeatFee: (id: string, amount: number) => request<SeatFee>(`/seat-fees/${id}`, 'PATCH', { amount }),

    getBaseCurrency: async () => {
      const settings = await request<PricingSetting[]>('/settings')
      return settings.find((setting) => setting.key === 'base_currency')?.value ?? 'THB'
    },
  }
}
