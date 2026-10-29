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
