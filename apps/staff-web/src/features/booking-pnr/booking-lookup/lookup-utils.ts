import type { BookingStatus, StaffBookingQuery } from '../api/types'

export type LookupPeriod = 'all' | 'today' | 'week' | 'month' | 'year' | 'last_year' | 'custom'
export interface LookupFilters {
  search: string
  dateType: 'booked' | 'travelling'
  period: LookupPeriod
  from: string
  to: string
  status: BookingStatus | ''
}
const isoDate = (date: Date) => date.toISOString().slice(0, 10)
export function lookupDateRange(period: LookupPeriod, now = new Date()): { from?: string; to?: string } {
  const year = now.getUTCFullYear(),
    month = now.getUTCMonth(),
    day = now.getUTCDate()
  if (period === 'today') return { from: isoDate(now), to: isoDate(now) }
  if (period === 'week') {
    const monday = new Date(Date.UTC(year, month, day - ((now.getUTCDay() + 6) % 7)))
    return { from: isoDate(monday), to: isoDate(new Date(monday.getTime() + 6 * 86400000)) }
  }
  if (period === 'month') return { from: isoDate(new Date(Date.UTC(year, month, 1))), to: isoDate(new Date(Date.UTC(year, month + 1, 0))) }
  if (period === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` }
  if (period === 'last_year') return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
  return {}
}
export function lookupQuery(filters: LookupFilters, page = 1, pageSize = 20, now = new Date()): StaffBookingQuery {
  const search = filters.search.trim()
  if (search) return { search, page, pageSize }
  let range = lookupDateRange(filters.period, now)
  if (filters.period === 'custom') {
    if (!filters.from || !filters.to || filters.from > filters.to)
      throw new Error('Choose a valid start and end date for the custom range.')
    for (const date of [filters.from, filters.to]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
        throw new Error('Choose valid calendar dates.')
    }
    range = { from: filters.from, to: filters.to }
  }
  return { page, pageSize, dateType: filters.dateType, ...range, ...(filters.status ? { status: filters.status } : {}) }
}
export const lookupMoney = (value: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(value)
export const lookupDate = (value: string | null, withTime = false) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        ...(withTime ? { timeStyle: 'short' as const } : {}),
        timeZone: 'UTC',
      }).format(new Date(value))
    : '—'
export const ticketLabel = (value: string | null) =>
  value ? (/^\d{13}$/.test(value) ? `${value.slice(0, 3)}-${value.slice(3)}` : value) : 'Not issued'
