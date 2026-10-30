import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { jsonInit, readResponse, type Method } from '../api'

// Mirrors EXPENSE_CATEGORIES in the backend's finance/finance.constants.ts.
export const EXPENSE_CATEGORIES = ['maintenance', 'staff', 'catering', 'other'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

// One row of GET /api/staff/payment-schedules (Member B's backend, Step 2).
export interface PaymentSchedule {
  id: string
  category: ExpenseCategory
  payee: string
  description: string | null
  amount: string // NUMERIC(12, 2), sent as a string: "24500"
  due_date: string // DATE, sent as midnight UTC: "2026-10-01T00:00:00.000Z"
  status: 'scheduled' | 'paid'
  paid_on: string | null
}

export function useFinanceApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
    return readResponse<T>(await fetchWithAuth(`/api/staff${path}`, jsonInit(method, body)))
  }

  return {
    listPaymentSchedules: () => request<PaymentSchedule[]>('/payment-schedules'),
  }
}
