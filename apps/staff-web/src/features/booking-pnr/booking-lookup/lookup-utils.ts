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
export const LOOKUP_PERIODS: LookupPeriod[] = ['all', 'today', 'week', 'month', 'year', 'last_year', 'custom']
export const LOOKUP_DATE_TYPES: LookupFilters['dateType'][] = ['booked', 'travelling']
export const LOOKUP_STATUSES: BookingStatus[] = ['held', 'confirmed', 'cancelled', 'expired']
export const LOOKUP_PAGE_SIZES = [20, 50, 100]

/**
 * The lookup filters as they live in the URL. Every field is optional: a bare `/booking-lookup` uses the defaults
 * below, and anything unrecognised is dropped rather than passed to the API.
 */
export interface LookupSearch {
  reference?: string
  /** The free-text search that was applied. */
  q?: string
  dateType?: LookupFilters['dateType']
  period?: LookupPeriod
  from?: string
  to?: string
  status?: BookingStatus
  page?: number
  pageSize?: number
}
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
function isIsoDate(value: string) {
  return ISO_DATE.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function asInteger(value: unknown): number | undefined {
  const text = typeof value === 'number' ? String(value) : asString(value)
  if (!text || !/^\d+$/.test(text)) return undefined
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}
/**
 * Normalises raw search params into the lookup's own shape. Bad values are dropped, so a hand-edited link falls back
 * to the defaults instead of failing the query. The custom range keeps its order check for the page to report.
 */
export function parseLookupSearch(raw: Record<string, unknown>): LookupSearch {
  const search: LookupSearch = {}
  const reference = asString(raw.reference)
  if (reference && /^[A-HJ-NP-Z2-9]{6}$/i.test(reference)) search.reference = reference.toUpperCase()
  const q = asString(raw.q)
  if (q) search.q = q.slice(0, 200)
  if (LOOKUP_DATE_TYPES.includes(raw.dateType as LookupFilters['dateType'])) search.dateType = raw.dateType as LookupFilters['dateType']
  if (LOOKUP_PERIODS.includes(raw.period as LookupPeriod)) search.period = raw.period as LookupPeriod
  const from = asString(raw.from)
  const to = asString(raw.to)
  if (from && isIsoDate(from)) search.from = from
  if (to && isIsoDate(to)) search.to = to
  if (LOOKUP_STATUSES.includes(raw.status as BookingStatus)) search.status = raw.status as BookingStatus
  const page = asInteger(raw.page)
  if (page !== undefined && page >= 1) search.page = page
  const pageSize = asInteger(raw.pageSize)
  if (pageSize !== undefined && LOOKUP_PAGE_SIZES.includes(pageSize)) search.pageSize = pageSize
  return search
}
/** The filter controls as they are shown, from the URL. */
export function lookupFiltersFromSearch(search: LookupSearch): LookupFilters {
  const period = search.period && LOOKUP_PERIODS.includes(search.period) ? search.period : 'week'
  const custom = period === 'custom'
  return {
    search: search.q ?? '',
    dateType: search.dateType === 'travelling' ? 'travelling' : 'booked',
    period,
    from: custom ? (search.from ?? '') : '',
    to: custom ? (search.to ?? '') : '',
    status: search.status && LOOKUP_STATUSES.includes(search.status) ? search.status : '',
  }
}
/** The API query for the current URL. Throws for an incomplete custom range, like `lookupQuery` does. */
export function lookupQueryFromSearch(search: LookupSearch): StaffBookingQuery {
  return lookupQuery(lookupFiltersFromSearch(search), search.page ?? 1, search.pageSize ?? 20)
}
/**
 * The URL for the filters the user is looking at. Defaults are left out, so a plain list stays at
 * `/booking-lookup` and only what was changed shows up in the query string.
 */
export function lookupSearchFromFilters(filters: LookupFilters, page = 1, pageSize = 20): LookupSearch {
  const search: LookupSearch = {}
  const text = filters.search.trim()
  if (text) search.q = text
  if (filters.dateType !== 'booked') search.dateType = filters.dateType
  if (filters.period !== 'week') search.period = filters.period
  if (filters.period === 'custom') {
    search.from = filters.from
    search.to = filters.to
  }
  if (filters.status) search.status = filters.status
  if (page > 1) search.page = page
  if (pageSize !== 20) search.pageSize = pageSize
  return search
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
/** "26 Oct" — the Booked column of the results table (frame 01). */
export const lookupShortDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(value)) : '—'
/** "Thu 12 Nov" — the flight date of the details dialog (frame 01o). */
export const lookupDayDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(value))
    : '—'
/** "11:40" — the flight times of the details dialog (frame 01o). */
export const lookupTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(value))
    : '—'
export const ticketLabel = (value: string | null) =>
  value ? (/^\d{13}$/.test(value) ? `${value.slice(0, 3)}-${value.slice(3)}` : value) : 'Not issued'
