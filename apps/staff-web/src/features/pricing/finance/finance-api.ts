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

// One row of GET /api/staff/expenses (Step 3). payment_schedule_id is set when "Mark paid" created it.
export interface Expense {
  id: string
  category: ExpenseCategory
  description: string
  amount: string
  incurred_on: string // DATE, sent as midnight UTC
  payment_schedule_id: string | null
}

// One row of GET /api/staff/finance/summary (Step 4). Money columns are NUMERIC strings.
export interface FinanceSummary {
  month: string // first day, sent as midnight UTC: "2026-10-01T00:00:00.000Z"
  revenue_amount: string
  pass_through_amount: string
  refund_amount: string
  maintenance_cost: string
  staff_cost: string
  catering_cost: string
  other_cost: string
  profit_amount: string
  computed_at: string
}

export interface NewPaymentSchedule {
  category: ExpenseCategory
  payee: string
  description?: string
  amount: number
  due_date: string // YYYY-MM-DD
}

export interface NewExpense {
  category: ExpenseCategory
  description: string
  amount: number
  incurred_on: string // YYYY-MM-DD
}

export function useFinanceApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
    return readResponse<T>(await fetchWithAuth(`/api/staff${path}`, jsonInit(method, body)))
  }

  return {
    listPaymentSchedules: () => request<PaymentSchedule[]>('/payment-schedules'),
    createPaymentSchedule: (input: NewPaymentSchedule) => request<PaymentSchedule>('/payment-schedules', 'POST', input),
    // Marks the bill paid and creates its expense in one go; 409 if it is already paid.
    payPaymentSchedule: (id: string) => request<PaymentSchedule>(`/payment-schedules/${id}/pay`, 'POST'),

    listExpenses: (month: string) => request<Expense[]>(`/expenses?month=${month}`),
    createExpense: (input: NewExpense) => request<Expense>('/expenses', 'POST', input),

    // Months that were never recomputed have no row, so the list can have gaps.
    listSummaries: (from: string, to: string) => request<FinanceSummary[]>(`/finance/summary?from=${from}&to=${to}`),
    recomputeSummary: (month: string) => request<FinanceSummary>(`/finance/summary/${month}/recompute`, 'POST'),
  }
}
