import type { FlightLeg, IsoInstant, LocalDate } from './types'

/** The roster is built in Bangkok time. A backend response would carry the same zone. */
export const ROSTER_TIME_ZONE = 'Asia/Bangkok'

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: ROSTER_TIME_ZONE,
})

const dayFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  timeZone: ROSTER_TIME_ZONE,
})

const fullDayFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: ROSTER_TIME_ZONE,
})

const longDayFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: ROSTER_TIME_ZONE,
})

const inputFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: ROSTER_TIME_ZONE,
})

/** `12:30`, in roster time. */
export function formatTime(instant: IsoInstant): string {
  return timeFormatter.format(new Date(instant))
}

/** `Wed 16 Sep`. */
export function formatDay(instant: IsoInstant): string {
  return dayFormatter.format(new Date(instant))
}

/** `Thu 17 Sep 2026`. */
export function formatFullDay(instant: IsoInstant): string {
  return fullDayFormatter.format(new Date(instant))
}

/** Same as `formatFullDay`; kept separate so intent is obvious at call sites. */
export function formatRemoveLegDay(instant: IsoInstant): string {
  return longDayFormatter.format(new Date(instant))
}

/** `15/09/2026`, the shape the date inputs show in the mockups. */
export function formatInputDate(date: LocalDate): string {
  return inputFormatter.format(new Date(`${date}T00:00:00.000Z`))
}

/** `2026-09-15`, the value an `<input type="date">` expects. */
export function toInputDate(date: LocalDate): string {
  return date
}

/** Converts a raw `<input type="date">` value into a `LocalDate`, or null when empty. */
export function parseInputDate(value: string): LocalDate | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

/** `5h 15m`. Zero minutes renders as `0m` so an empty cell is never ambiguous. */
export function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes)
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0) return `${hours}h`
  return `${hours}h ${String(rest).padStart(2, '0')}m`
}

/** `2 flights` / `1 flight` / `2 flights · 2 days`. */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** `1 a day` reads better than `1 a day`; kept as a helper because the checks use it. */
export function formatFlightsPerDay(count: number): string {
  return count === 1 ? '1 a day' : String(count)
}

/** `BKK ➔ NRT ➔ BKK`. Matches the arrow glyph used across the mockups. */
export function formatRoute(route: readonly string[]): string {
  return route.join(' ➔ ')
}

/** Minutes between two instants. */
export function minutesBetween(from: IsoInstant, to: IsoInstant): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 60_000
}

/** `YYYY-MM-DD` in roster time, used to group legs into duty days. */
export function localDateKey(instant: IsoInstant): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: ROSTER_TIME_ZONE,
  }).format(new Date(instant))
  return parts
}

/** Whole calendar days in `[dateFrom, dateTo]`, inclusive. */
export function daysInRange(dateFrom: LocalDate, dateTo: LocalDate): number {
  const from = new Date(`${dateFrom}T00:00:00.000Z`).getTime()
  const to = new Date(`${dateTo}T00:00:00.000Z`).getTime()
  return Math.round((to - from) / 86_400_000) + 1
}

/** `15–19 Sep 2026`, the roster run badge and the modal range copy. */
export function formatDateRange(dateFrom: LocalDate, dateTo: LocalDate): string {
  const from = new Date(`${dateFrom}T00:00:00.000Z`)
  const to = new Date(`${dateTo}T00:00:00.000Z`)
  if (dateFrom === dateTo) return longDayFormatter.format(from)
  const sameMonth = from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear()
  const startDay = new Intl.DateTimeFormat('en-GB', { day: '2-digit', timeZone: 'UTC' }).format(from)
  const endDay = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  if (sameMonth) {
    const monthYear = endDay.format(to).replace(/^\d{2}/, '')
    return `${startDay}–${monthYear}`
  }
  return `${fullDayFormatter.format(from)} – ${fullDayFormatter.format(to)}`
}

/** `1 valid`, `1 invalid`, `1 deleted` — used by the summary metrics bar. */
export function formatCountLabel(count: number, noun: string): string {
  return `${count} ${noun}`
}

/**
 * The date line at the top of the delete modal's pairing card: a single day on
 * its own (`Thu 17 Sep 2026`) or a span with the shared month collapsed
 * (`Wed 16 – Thu 17 Sep 2026`).
 */
export function formatLegDaySpan(legs: readonly FlightLeg[]): string {
  const first = legs[0]
  const last = legs.at(-1)
  if (!first || !last) return '—'

  const startKey = localDateKey(first.departureAt)
  const endKey = localDateKey(last.arrivalAt)
  if (startKey === endKey) return formatRemoveLegDay(first.departureAt)

  const start = new Date(`${startKey}T00:00:00.000Z`)
  const end = new Date(`${endKey}T00:00:00.000Z`)
  const startLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', timeZone: 'UTC' }).format(start)
  const endLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(end)
  return `${startLabel} – ${endLabel}`
}

/** `08:00–13:30`, first wheels-up to last wheels-down. */
export function formatLegTimeSpan(legs: readonly FlightLeg[]): string {
  const first = legs[0]
  const last = legs.at(-1)
  if (!first || !last) return '—'
  return `${formatTime(first.departureAt)}–${formatTime(last.arrivalAt)}`
}

/** `16–17 Sep`, the short range used beside the day count in the delete modal. */
export function formatShortDayRange(legs: readonly FlightLeg[]): string {
  const first = legs[0]
  const last = legs.at(-1)
  if (!first || !last) return '—'
  return formatDateRange(localDateKey(first.departureAt), localDateKey(last.arrivalAt))
}
