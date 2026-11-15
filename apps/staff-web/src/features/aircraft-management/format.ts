/**
 * Every date and number of this feature goes through `Intl`, so a locale change stays a one-line
 * change here instead of a sweep through the pages.
 */

/** Calendar dates are stored as UTC, so they are formatted in UTC to avoid a day shift. The design writes them as 2019-03-14. */
const calendarDate = new Intl.DateTimeFormat('sv-SE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})

const clockTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

const wholeNumber = new Intl.NumberFormat('en-US')

const ratio = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const currency = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const currencyFormats = new Map<number, Intl.NumberFormat>()

function currencyFormatter(fractionDigits: number): Intl.NumberFormat {
  const cached = currencyFormats.get(fractionDigits)
  if (cached) {
    return cached
  }
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
  currencyFormats.set(fractionDigits, formatter)
  return formatter
}

function parse(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: string | null | undefined): string {
  const date = parse(value)
  return date ? calendarDate.format(date) : '—'
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parse(value)
  return date ? `${calendarDate.format(date)} ${clockTime.format(date)}` : '—'
}

/** The time of day only, for the turnaround cards. */
export function formatTime(value: string | null | undefined): string {
  const date = parse(value)
  return date ? clockTime.format(date) : '—'
}

export function formatNumber(value: number): string {
  return wholeNumber.format(value)
}

export function formatRatio(value: number): string {
  return ratio.format(value)
}

export function formatCurrency(value: number, currencyCode: string, fractionDigits = 2): string {
  return `${currencyCode} ${(fractionDigits === 2 ? currency : currencyFormatter(fractionDigits)).format(value)}`
}

/** `YYYY-MM-DD` for an `<input type="date">` value. */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}
