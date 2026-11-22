import { checkDigit } from '../domain/mrz.ts'

export const MRZ_LENGTH = 44

/** The four ICAO 9303 check digits, in the order the passport prints them. */
export const MRZ_CHECKS = [
  { name: 'number', label: 'Passport number check digit', field: (l2: string) => l2.slice(0, 9), digit: 9 },
  { name: 'date_of_birth', label: 'Date of birth check digit', field: (l2: string) => l2.slice(13, 19), digit: 19 },
  { name: 'expiry', label: 'Expiry date check digit', field: (l2: string) => l2.slice(21, 27), digit: 27 },
  {
    name: 'composite',
    label: 'Composite check digit',
    field: (l2: string) => l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43),
    digit: 43,
  },
] as const

/** A line is ready when it is 44 characters once trimmed and upper-cased, the way the server reads it. */
export function mrzLineReady(raw: string): boolean {
  return raw.trim().toUpperCase().length === MRZ_LENGTH
}

/**
 * The same four checks the server runs. A line the server would reject (not 44 characters of
 * A-Z, 0-9 and <) is reported as all failed, so the checklist never shows a false green.
 */
export function inlineMrzChecks(rawLine2: string): Array<{ name: string; ok: boolean }> {
  const line = rawLine2.trim().toUpperCase()
  const formatOk = /^[A-Z0-9<]{44}$/.test(line)
  return MRZ_CHECKS.map((check) => ({
    name: check.name,
    ok: formatOk && checkDigit(check.field(line)) === Number(line[check.digit]),
  }))
}
