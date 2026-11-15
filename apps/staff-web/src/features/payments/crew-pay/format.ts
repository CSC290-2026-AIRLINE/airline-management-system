import type { Tone } from '../format'
import type { PayrollLineStatus, PayrollLineType, PayRunStatus } from './api'

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  // Dates come as midnight UTC; show the calendar date, not the local-time shift of it.
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
}

export function payRunStatus(status: PayRunStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'draft':
      return { label: 'Draft', tone: 'info' }
    case 'approved':
      return { label: 'Approved', tone: 'warn' }
    case 'paid':
      return { label: 'Paid', tone: 'good' }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' }
    default: {
      const unknown: never = status
      return { label: unknown, tone: 'neutral' }
    }
  }
}

export function lineStatus(status: PayrollLineStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'accrued':
      return { label: 'Accrued', tone: 'info' }
    case 'in_run':
      return { label: 'In a run', tone: 'warn' }
    case 'paid':
      return { label: 'Paid', tone: 'good' }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' }
    default: {
      const unknown: never = status
      return { label: unknown, tone: 'neutral' }
    }
  }
}

export function lineTypeLabel(type: PayrollLineType): string {
  switch (type) {
    case 'base':
      return 'Base'
    case 'overtime':
      return 'Overtime'
    case 'per_diem':
      return 'Per diem'
    case 'adjustment':
      return 'Adjustment'
    default: {
      const unknown: never = type
      return unknown
    }
  }
}

export const LINE_TYPES: PayrollLineType[] = ['base', 'overtime', 'per_diem', 'adjustment']

export function roleLabel(role: string): string {
  return role.replace('_', ' ').replace(/^./, (c) => c.toUpperCase())
}

/** "3.50 h × 85.00 × 1.50" — what a priced line was computed from. */
export function lineWorking(line: {
  line_type: PayrollLineType
  quantity: string | null
  rate: string | null
  multiplier: string | null
}): string {
  if (!line.quantity || !line.rate) return ''
  const unit = line.line_type === 'per_diem' ? ' nights' : ' h'
  const mult = line.multiplier && Number(line.multiplier) !== 1 ? ` × ${line.multiplier}` : ''
  return `${line.quantity}${unit} × ${line.rate}${mult}`
}

const MONTH_LONG = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** 111771.1 -> "111,771.10" (the design shows the currency beside the number, not in it). */
export function formatAmount(value: string | number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))
}

/** A whole calendar month reads "October 2026"; anything else "1 Oct – 15 Nov 2026". */
export function runLabel(periodStart: string, periodEnd: string): string {
  const start = new Date(periodStart)
  const end = new Date(periodEnd)
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
  const wholeMonth =
    start.getUTCDate() === 1 &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear() &&
    end.getUTCDate() === lastDay
  return wholeMonth ? MONTH_LONG.format(start) : `${DAY_MONTH.format(start)} – ${DAY_MONTH.format(end)} ${end.getUTCFullYear()}`
}

/** "period 1 – 31 Oct". */
export function periodText(periodStart: string, periodEnd: string): string {
  const start = new Date(periodStart)
  const end = new Date(periodEnd)
  const sameMonth = start.getUTCMonth() === end.getUTCMonth()
  return `period ${sameMonth ? start.getUTCDate() : DAY_MONTH.format(start)} – ${DAY_MONTH.format(end)}`
}

export function shortDate(value: string | null | undefined): string {
  return value ? DAY_MONTH.format(new Date(value)) : '—'
}

export function longDate(value: string | null | undefined): string {
  return value
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
    : '—'
}

/** The rank as the crew table shows it. */
export function rankLabel(role: string): string {
  switch (role) {
    case 'captain':
      return 'Captain'
    case 'first_officer':
      return 'First officer'
    case 'cabin_crew':
      return 'Cabin crew'
    case 'police':
      return 'Air marshal'
    default:
      return role
  }
}

const RANK_PREFIX: Record<string, string> = { captain: 'Captain', first_officer: 'FO', cabin_crew: 'CC', police: 'AM' }

/** "Captain P. Wongsa", "FO S. Chaiyo", "CC N. Prasert". */
export function crewDisplayName(crew: { first_name: string; last_name: string; role: string }): string {
  return `${RANK_PREFIX[crew.role] ?? ''} ${crew.first_name.charAt(0)}. ${crew.last_name}`.trim()
}
