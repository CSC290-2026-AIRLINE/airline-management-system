import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ApiError } from './errors'

type Money = string

export type PayRunStatus = 'draft' | 'approved' | 'paid' | 'cancelled'
export type PayrollLineType = 'base' | 'overtime' | 'per_diem' | 'adjustment'
export type PayrollLineStatus = 'accrued' | 'in_run' | 'paid' | 'cancelled'

export interface CrewRef {
  id: string
  first_name: string
  last_name: string
  role: string
  employee_number?: string
}

export interface PayrollLine {
  id: string
  crew_id: string
  pairing_id: string | null
  line_type: PayrollLineType
  quantity: Money | null
  rate: Money | null
  multiplier: Money | null
  amount: Money
  description: string
  earned_on: string
  status: PayrollLineStatus
  pay_run_id: string | null
  pairing: { code: string } | null
}

export interface PayRunSummary {
  id: string
  period_start: string
  period_end: string
  status: PayRunStatus
  created_by: string
  approved_by: string | null
  paid_at: string | null
  created_at: string
  line_count: number
  crew_count: number
  total: Money
}

export interface Viewer {
  first_name: string
  last_name: string
  role: string
}

export interface PairingLeg {
  flight: { flight_number: string; dep_at: string; route: { origin: string; destination: string } }
}

export interface PayRunsOverview {
  currency: string
  viewer: Viewer
  runs: PayRunSummary[]
  accrued: { total: Money; lines: (PayrollLine & { crew: CrewRef })[] }
  crew: (CrewRef & { employee_number: string })[]
}

export interface PayRunDetail {
  id: string
  period_start: string
  period_end: string
  status: PayRunStatus
  paid_at: string | null
  currency: string
  created_by: { id: string; name: string }
  approved_by: string | null
  audit_log: { id: string; occurred_at: string; reason: string | null } | null
  payout: {
    id: string
    crew_id: string
    amount: Money
    status: 'pending' | 'paid' | 'failed'
    reference: string | null
    failure_reason: string | null
    paid_at: string | null
  }[]
  total: Money
  has_adjustment: boolean
  needs_admin: boolean
  is_creator: boolean
  rules: {
    overtime_threshold_hours: number
    overtime_multiplier: number
    pay_run_override_limit: Money
    rates: { crew_role: string; hourly_rate: Money; per_diem: Money }[]
  }
  crew: { crew: CrewRef & { employee_number: string }; lines: PayrollLine[]; totals: Partial<Record<PayrollLineType, Money>>; net: Money }[]
}

export interface MyPay {
  crew: CrewRef & { employee_number: string; base_airport: string }
  currency: string
  viewer: Viewer
  totals: { accrued: Money; in_run: Money; paid: Money; overtime: Money }
  lines: (Omit<PayrollLine, 'pairing'> & {
    pairing: { code: string; pairing_leg: PairingLeg[] } | null
    pay_run: { period_start: string; period_end: string; status: PayRunStatus } | null
  })[]
  payouts: {
    id: string
    amount: Money
    status: string
    reference: string | null
    paid_at: string | null
    pay_run: { id: string; period_start: string; period_end: string; status: PayRunStatus; paid_at: string | null }
  }[]
}

async function readResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as { message?: string | string[]; error?: { code?: string; message?: string } } | null
  if (!res.ok) {
    const message =
      data?.error?.message ?? (Array.isArray(data?.message) ? data.message.join('; ') : data?.message) ?? `Request failed (${res.status})`
    throw new ApiError(message, res.status, data?.error?.code)
  }
  return data as T
}

export function useCrewPayApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
    return readResponse<T>(
      await fetchWithAuth(`/api${path}`, {
        method,
        ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      }),
    )
  }

  return {
    overview: () => request<PayRunsOverview>('/staff/pay-runs'),
    createRun: (periodStart: string, periodEnd: string) =>
      request<{ id: string }>('/staff/pay-runs', 'POST', { period_start: periodStart, period_end: periodEnd }),
    getRun: (id: string) => request<PayRunDetail>(`/staff/pay-runs/${id}`),
    approve: (id: string, note?: string) => request<unknown>(`/staff/pay-runs/${id}/approve`, 'POST', note ? { note } : {}),
    pay: (id: string) => request<unknown>(`/staff/pay-runs/${id}/pay`, 'POST'),
    cancel: (id: string) => request<unknown>(`/staff/pay-runs/${id}/cancel`, 'POST'),
    addAdjustment: (input: { crew_id: string; amount: number; description: string; earned_on?: string; pay_run_id?: string }) =>
      request<PayrollLine>('/staff/payroll-lines/adjustments', 'POST', input),
    myPay: () => request<MyPay>('/crew/me/pay'),
    retryPayout: (id: string) => request<{ status: string; failure_reason: string | null }>(`/staff/payouts/${id}/retry`, 'POST'),
  }
}
