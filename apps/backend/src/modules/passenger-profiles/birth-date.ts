export type BirthDateError = 'format' | 'invalid' | 'too_early' | 'future'

/** One calendar-DOB rule for customer setup, saved passengers and staff create/correction. */
export function birthDateError(value: unknown, today: Date): BirthDateError | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'format'
  if (!Number.isFinite(today.getTime())) return 'invalid'
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'invalid'
  if (year < 1900) return 'too_early'
  const latestDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return date.getTime() > latestDay ? 'future' : null
}

/** Validate against a caller-supplied day; no clock or database access here. */
export function isValidBirthDate(value: unknown, today: Date): boolean {
  return birthDateError(value, today) === null
}
