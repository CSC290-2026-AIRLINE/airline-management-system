/** Validate a calendar DOB against a caller-supplied day; no clock or database access here. */
export function isValidBirthDate(value: unknown, today: Date): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(today.getTime())) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const latestDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return (
    year >= 1900 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getTime() <= latestDay
  )
}
