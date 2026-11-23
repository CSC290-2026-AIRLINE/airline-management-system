/**
 * Display formatting for the Reports & Analytics screen.
 *
 * Everything goes through `Intl` so a later localisation pass is a one-line change per formatter.
 * All timestamps are read as UTC — the backend sends UTC (see `types.ts`), and the simulation clock
 * in the design is what the numbers are relative to.
 */

const UTC = 'UTC'

const countFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const oneDecimalFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const dayMonthFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: UTC })
const dayMonthYearFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: UTC })
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: UTC })
const dayMonthTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: UTC,
})
const updatedAtFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: UTC,
})

/** `1332` -> "1,332". */
export function formatCount(value: number): string {
  return countFormat.format(value)
}

/** `3.6` -> "3.6". */
export function formatDecimal(value: number): string {
  return oneDecimalFormat.format(value)
}

/** `192` -> "3m 12s", `245` -> "4m 05s". `null` -> the em dash the design uses for missing values. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return '—'
  }
  if (seconds < 60) {
    return `${countFormat.format(seconds)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}m ${String(rest).padStart(2, '0')}s`
}

/** `2026-10-14` -> "14 Oct". */
export function formatDayMonth(iso: string): string {
  return dayMonthFormat.format(new Date(`${iso}T00:00:00Z`))
}

/** `2026-11-12T23:41:00Z` -> "12 Nov 2026". */
export function formatDayMonthYear(iso: string): string {
  return dayMonthYearFormat.format(new Date(iso))
}

/** `2026-11-12T23:41:00Z` -> "23:41". */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

/** `2026-11-12T23:41:00Z` -> "12 Nov, 23:41". */
export function formatDateTime(iso: string): string {
  return dayMonthTimeFormat.format(new Date(iso))
}

/** `2026-11-12T23:53:00Z` -> "Thursday 12 Nov, 11:53 PM". */
export function formatUpdatedAt(iso: string): string {
  return updatedAtFormat.format(new Date(iso))
}

/** `2026-10-14` .. `2026-11-12` -> "14 Oct – 12 Nov 2026". */
export function formatRange(from: string, to: string): string {
  return `${dayMonthFormat.format(new Date(`${from}T00:00:00Z`))} – ${dayMonthYearFormat.format(new Date(`${to}T00:00:00Z`))}`
}
