/**
 * The date helpers behind the shared date field. They are kept here, away from the component, because the pages need
 * the same rules: a date travels as a plain `YYYY-MM-DD` string, and it is read and written in the local time zone, so
 * a date never moves a day because of the offset.
 */

/** A date as the `YYYY-MM-DD` key the API uses. */
export function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** A `YYYY-MM-DD` key as a local date. */
export function fromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Today as a key. */
export function todayKey(): string {
  return toKey(new Date())
}

/** The first day of the month a key is in. */
export function monthStart(key: string): string {
  const date = fromKey(key)
  return toKey(new Date(date.getFullYear(), date.getMonth(), 1))
}

/** The same day a number of days later. */
export function addDays(key: string, days: number): string {
  const date = fromKey(key)
  return toKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
}

/** The same day one month later. The day number is clamped, so 31 January becomes 28 or 29 February. */
export function addMonths(key: string, months: number): string {
  const date = fromKey(key)
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return toKey(new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay)))
}

/** The same day one year later. 29 February becomes 28 February. */
export function addYears(key: string, years: number): string {
  const date = fromKey(key)
  const target = new Date(date.getFullYear() + years, date.getMonth(), 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return toKey(new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay)))
}

/** The day of the week a key is on, counted from Monday. */
export function weekdayIndex(key: string): number {
  return (fromKey(key).getDay() + 6) % 7
}

/** Whether a day can be chosen: inside the range the field was given. */
export function isSelectable(key: string, min?: string, max?: string): boolean {
  if (min && key < min) return false
  if (max && key > max) return false
  return true
}

/** Keeps a date inside the range, so the calendar never focuses a day that cannot be chosen. */
export function clampKey(key: string, min?: string, max?: string): string {
  if (min && key < min) return min
  if (max && key > max) return max
  return key
}

export interface CalendarDay {
  key: string
  day: number
  /** Whether the day is in the month on screen, or in the month before or after it. */
  inMonth: boolean
  disabled: boolean
}

/**
 * The six weeks of the month on screen, starting on Monday. The weeks always hold seven days, so the calendar does
 * not change height from one month to the next.
 */
export function calendarWeeks(view: string, min?: string, max?: string): CalendarDay[][] {
  const first = fromKey(view)
  const leading = weekdayIndex(view)
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - leading)
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    const key = toKey(date)
    return {
      key,
      day: date.getDate(),
      inMonth: date.getMonth() === first.getMonth(),
      disabled: !isSelectable(key, min, max),
    }
  })
  return Array.from({ length: 6 }, (_, week) => days.slice(week * 7, week * 7 + 7))
}

/** The years the calendar offers: the range the field was given, or the years around today. */
export function calendarYears(min?: string, max?: string): number[] {
  const now = new Date().getFullYear()
  const first = min ? fromKey(min).getFullYear() : now - 1
  const last = max ? fromKey(max).getFullYear() : now + 3
  return Array.from({ length: Math.max(1, last - first + 1) }, (_, index) => first + index)
}
