import type { Gender, Person } from '../types'

/**
 * One place for every user-visible formatting rule. Keeping them here means a
 * later switch to `th-TH` locale or a `en-US` date order is a one-line change.
 *
 * Every helper here takes a nullable value: the API returns `null` for a
 * date of birth, gender, nationality or passport that was never recorded, and
 * these helpers decide what shows in place of a missing value.
 */

/** What every field renders when the value is missing. Matches the design's em dash. */
export const EM_DASH = '—'

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const monthYearFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' })

/**
 * The country names the design and the seed data use. `Intl.DisplayNames` is the
 * fallback for anything not listed, so a nationality the backend has never seen
 * still renders as a real country name rather than a raw code.
 */
const NATIONALITY_LABELS: Record<string, string> = {
  th: 'Thai',
  mm: 'Myanmar',
  sg: 'Singaporean',
  my: 'Malaysian',
  jp: 'Japanese',
  hk: 'Hong Kong',
  kh: 'Cambodian',
  la: 'Laotian',
  id: 'Indonesian',
  vn: 'Vietnamese',
  ph: 'Filipino',
  in: 'Indian',
  gb: 'British',
  us: 'American',
  au: 'Australian',
}

const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null

/**
 * `th` -> `Thai`. Falls back to `Intl.DisplayNames`, then to the upper-cased code,
 * so an unknown value degrades to something readable instead of rendering blank.
 */
export function nationalityLabel(code: string | null): string {
  if (!code) {
    return EM_DASH
  }
  const key = code.toLowerCase()
  const override = NATIONALITY_LABELS[key]
  if (override) {
    return override
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code.toUpperCase()
  } catch {
    // `Intl` rejects anything that is not a valid region subtag, such as `other`.
    return code.toUpperCase()
  }
}

/** `th` -> `Thai (th)`, as rendered in the correction dialog's "Now:" column. */
export function nationalityWithCode(code: string | null): string {
  return code ? `${nationalityLabel(code)} (${code})` : EM_DASH
}

/**
 * The API returns `dateOfBirth` as a full ISO timestamp (`1995-04-14T00:00:00.000Z`)
 * because the column is a `DATE`; this reduces it to the `yyyy-mm-dd` the rest of
 * the feature works in.
 */
export function toIsoDate(value: string | null): string | null {
  return value ? value.slice(0, 10) : null
}

/** `1995-04-14` -> `14 Apr 1995`. */
export function formatDateOfBirth(iso: string | null): string {
  if (!iso) {
    return EM_DASH
  }
  const date = new Date(`${iso}T00:00:00Z`)
  // `Intl` throws a RangeError on an invalid date, so an unexpected value must
  // not be allowed to take down the whole profile.
  return Number.isNaN(date.getTime()) ? EM_DASH : dateFormatter.format(date)
}

/** An ISO timestamp (`2026-08-14T…Z`) -> `Aug 2026`. */
export function formatMonthYear(timestamp: string | null): string | null {
  if (!timestamp) {
    return null
  }
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : monthYearFormatter.format(date)
}

/** `1995-04-14` -> `14 / 04 / 1995`, the value the dialog's text input starts with. */
export function toInputDate(iso: string | null): string {
  if (!iso) {
    return ''
  }
  const [year, month, day] = iso.split('-')
  return `${day} / ${month} / ${year}`
}

/**
 * Accepts `21 / 08 / 1992`, `21/08/1992` or `1992-08-21` and returns `1992-08-21`.
 * Returns `null` when the input is not a real calendar date, and for an empty
 * field, which the dialog reads as "leave this value as it is".
 */
export function parseInputDate(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }
  const dmy = /^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})$/.exec(trimmed)
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)

  const day = dmy ? Number(dmy[1]) : ymd ? Number(ymd[3]) : Number.NaN
  const month = dmy ? Number(dmy[2]) : ymd ? Number(ymd[2]) : Number.NaN
  // The DMY pattern has three capture groups — the separators are a character class, not a group.
  const year = dmy ? Number(dmy[3]) : ymd ? Number(ymd[1]) : Number.NaN

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  const isReal = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  if (!isReal) {
    return null
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Always renders the last four digits only; the full number never reaches the DOM. */
export function maskPassport(passportNumber: string | null): string {
  return passportNumber ? `•••• ${passportNumber.slice(-4)}` : EM_DASH
}

export function genderLabel(gender: Gender | null): string {
  if (gender === 'F') return 'Female'
  if (gender === 'M') return 'Male'
  if (gender === 'X') return 'Unspecified'
  return EM_DASH
}

/** `Anya Saranpat` — the Latin name, which is always present. */
export function personName(person: Person): string {
  return `${person.firstName} ${person.lastName}`
}

/** `AS` — derived here rather than stored, so it can never drift from the name. */
export function initialsOf(person: Pick<Person, 'firstName' | 'lastName'>): string {
  return `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase()
}

/** The local spelling joined for display, or null when either part is missing. */
export function localNameOf(person: Pick<Person, 'localFirstName' | 'localLastName'>): string | null {
  const parts = [person.localFirstName, person.localLastName].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' ') : null
}
