import type { ExpenseCategory } from './finance-api'

export const AMOUNT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
// DATE columns arrive as midnight UTC, so read them in UTC or a negative offset shows the day before.
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

// "1 Oct" this year, "1 Oct 2027" otherwise.
export function shortDate(isoDate: string) {
  const date = new Date(isoDate)
  return date.getUTCFullYear() === new Date().getFullYear() ? DAY_MONTH.format(date) : DAY_MONTH_YEAR.format(date)
}

// "5 Oct 2026"
export function fullDate(isoDate: string) {
  return DAY_MONTH_YEAR.format(new Date(isoDate))
}

// '2026-10' → "Oct 2026"
export function monthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return MONTH_YEAR.format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

// Today as YYYY-MM-DD in local time, comparable with a DATE column.
// TODO: use the simulated date once Core exposes it; until then this is the real date, like the backend.
export function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// '2026-10' moved by whole months: shiftMonth('2026-01', -1) is '2025-12'.
export function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7)
}

const DATE_TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// "31 Oct 2026, 01:51" in local time (for timestamps, not DATE columns).
export function dateTime(iso: string | Date) {
  return DATE_TIME.format(new Date(iso))
}

export function categoryLabel(category: ExpenseCategory): string {
  switch (category) {
    case 'maintenance':
      return 'Maintenance'
    case 'staff':
      return 'Staff'
    case 'catering':
      return 'Catering'
    case 'other':
      return 'Other'
    default: {
      const unknown: never = category
      return unknown
    }
  }
}
