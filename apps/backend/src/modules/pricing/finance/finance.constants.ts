export const EXPENSE_CATEGORIES = ['maintenance', 'staff', 'catering', 'other'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const PAYMENT_SCHEDULE_STATUSES = ['scheduled', 'paid'] as const
export type PaymentScheduleStatus = (typeof PAYMENT_SCHEDULE_STATUSES)[number]

// YYYY-MM-DD; DATE columns hold no time.
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// TODO: read the simulated date once Core says how. Until then this is the real date, as UTC midnight to match DATE columns.
export function simulatedToday(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

// TODO: read the simulated time once Core says how. Until then this is the real time.
export function simulatedNow(): Date {
  return new Date()
}

// YYYY-MM, e.g. 2026-11. A month is stored as its first day (DATE 2026-11-01).
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

// '2026-11' → 2026-11-01 (UTC midnight, to match DATE columns). offset moves whole months: offset 1 gives 2026-12-01.
export function monthStart(month: string, offset = 0): Date {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1))
}
