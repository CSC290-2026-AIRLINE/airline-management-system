// Calendar arithmetic in UTC. Business timestamps come from the simulation clock and are stored as UTC.

// Adds whole months, clamping to the last day of a shorter month (31 Jan + 1 month = 28 or 29 Feb).
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

// The calendar date (YYYY-MM-DD, UTC) used in reminder keys and to group credits that expire on the same day.
export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}
