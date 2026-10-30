import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { jsonInit, readResponse, type Cabin, type Method } from '../api'

// Mirror SEAT_TYPES, TAX_FEE_KINDS and TAX_FEE_CALC_TYPES in the backend's pricing.constants.ts.
export const SEAT_TYPES = ['normal', 'exit_row', 'extra_legroom'] as const
export type SeatType = (typeof SEAT_TYPES)[number]

export const TAX_FEE_KINDS = ['tax', 'surcharge', 'fee'] as const
export type TaxFeeKind = (typeof TAX_FEE_KINDS)[number]

export const TAX_FEE_CALC_TYPES = ['flat', 'pct'] as const
export type TaxFeeCalcType = (typeof TAX_FEE_CALC_TYPES)[number]

// Prisma sends NUMERIC columns as strings ("150.00"); read them with Number().
type Decimal = string | number

export interface SeatFee {
  id: string
  cabin: Cabin
  seat_type: SeatType
  amount: Decimal
}

export interface TaxFee {
  id: string
  code: string
  name: string
  kind: TaxFeeKind
  calc_type: TaxFeeCalcType
  value: Decimal
  is_active: boolean
}

export type TaxFeeInput = Omit<TaxFee, 'id' | 'value'> & { value: number }

export interface BaggageRate {
  id: string
  fare_class_id: string
  route_id: string | null
  free_allowance_kg: Decimal
  rate_per_kg: Decimal
  max_bag_kg: Decimal | null
  is_active: boolean
  fare_class: { code: string; name: string; cabin: Cabin }
  route: { origin: string; destination: string } | null
}

export interface BaggageRateInput {
  fare_class_id: string
  route_id: string | null
  free_allowance_kg: number
  rate_per_kg: number
  max_bag_kg: number | null
  is_active?: boolean
}

export interface BaggageCharge {
  baggage_rate_id: string
  route_id: string | null
  weight_kg: number
  free_allowance_kg: number
  max_bag_kg: number | null
  rate_per_kg: number
  chargeable_kg: number
  charge: number
}

// Same fetchWithAuth path as usePricingApi; the baggage charge lookup lives outside /api/staff.
export function useAddOnChargesApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
    return readResponse<T>(await fetchWithAuth(`/api${path}`, jsonInit(method, body)))
  }

  return {
    listSeatFees: () => request<SeatFee[]>('/staff/seat-fees'),
    createSeatFee: (cabin: Cabin, seatType: SeatType, amount: number) =>
      request<SeatFee>('/staff/seat-fees', 'POST', { cabin, seat_type: seatType, amount }),
    updateSeatFee: (id: string, amount: number) => request<SeatFee>(`/staff/seat-fees/${id}`, 'PATCH', { amount }),
    deleteSeatFee: (id: string) => request<void>(`/staff/seat-fees/${id}`, 'DELETE'),

    listTaxFees: () => request<TaxFee[]>('/staff/tax-fees?include_inactive=true'),
    createTaxFee: (input: TaxFeeInput) => request<TaxFee>('/staff/tax-fees', 'POST', input),
    updateTaxFee: (id: string, input: Partial<TaxFeeInput>) => request<TaxFee>(`/staff/tax-fees/${id}`, 'PATCH', input),
    deleteTaxFee: (id: string) => request<void>(`/staff/tax-fees/${id}`, 'DELETE'),

    listBaggageRates: () => request<BaggageRate[]>('/staff/baggage-rates'),
    createBaggageRate: (input: BaggageRateInput) => request<BaggageRate>('/staff/baggage-rates', 'POST', input),
    updateBaggageRate: (id: string, input: Partial<BaggageRateInput>) => request<BaggageRate>(`/staff/baggage-rates/${id}`, 'PATCH', input),
    deleteBaggageRate: (id: string) => request<void>(`/staff/baggage-rates/${id}`, 'DELETE'),
    baggageCharge: (fareClassId: string, weightKg: number, routeId?: string) => {
      const params = new URLSearchParams({ fare_class_id: fareClassId, weight_kg: String(weightKg), ...(routeId && { route_id: routeId }) })
      return request<BaggageCharge>(`/baggage-charge?${params.toString()}`)
    },
  }
}
