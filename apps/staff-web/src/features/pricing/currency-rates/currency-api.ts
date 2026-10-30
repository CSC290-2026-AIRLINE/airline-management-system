import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { jsonInit, readResponse, type Method } from '../api'

// One row of GET /api/staff/currency-rates (Member B's backend, Step 1).
export interface CurrencyRate {
  currency_code: string
  rate_per_base: string // NUMERIC(14, 6), sent as a string: "33.500000"
  updated_at: string
  staff: { id: string; staff_code: string; first_name: string; last_name: string }
}

export function useCurrencyRateApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
    return readResponse<T>(await fetchWithAuth(`/api/staff/currency-rates${path}`, jsonInit(method, body)))
  }

  return {
    list: () => request<CurrencyRate[]>(''),
    create: (code: string, rate: number) => request<CurrencyRate>('', 'POST', { currency_code: code, rate_per_base: rate }),
    update: (code: string, rate: number) => request<CurrencyRate>(`/${code}`, 'PATCH', { rate_per_base: rate }),
  }
}
