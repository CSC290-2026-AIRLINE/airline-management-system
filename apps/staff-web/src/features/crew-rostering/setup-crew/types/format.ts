import type { Certification, CrewMember, LicenceState, LocalDate } from './types'

/** The roster is read in Bangkok time; a backend response would carry the same zone. */
export const ROSTER_TIME_ZONE = 'Asia/Bangkok'

/**
 * "Today" for every expiry calculation.
 *
 * The whole app runs against a fixed simulation date, so a certificate that is
 * "in 14 days" must not drift as the machine's clock moves. The mock data and
 * the simulation clock agree on this value.
 */
export const SIMULATION_TODAY: LocalDate = '2026-09-14'

/** Whole days between the simulation clock and a date. Negative once past. */
export function daysUntil(date: LocalDate, from: LocalDate = SIMULATION_TODAY): number {
  const target = new Date(`${date}T00:00:00.000Z`).getTime()
  const start = new Date(`${from}T00:00:00.000Z`).getTime()
  return Math.round((target - start) / 86_400_000)
}

/**
 * Month abbreviations, still from `Intl` so a locale change stays a one-line
 * edit — but trimmed to three letters. The en-GB short month for September is
 * `Sept`, and the design calls for `Sep`.
 */
const MONTHS = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2021, month, 1))).slice(0, 3),
)

function monthIndex(date: LocalDate): number {
  return Number(date.slice(5, 7)) - 1
}

/** `18 Apr 1994`, the shape every date on this page is written in. */
export function formatDate(date: LocalDate): string {
  return `${date.slice(8, 10)} ${MONTHS[monthIndex(date)]} ${date.slice(0, 4)}`
}

/** `18/09/2026`, the value an `<input type="date">` reads as dd/mm/yyyy. */
export function toInputDate(date: LocalDate): string {
  return date
}

/** Converts a raw `<input type="date">` value into a `LocalDate`, or null when empty. */
export function parseInputDate(value: string): LocalDate | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

/** `MJ`, the two-letter avatar for a crew member. */
export function initials(crew: Pick<CrewMember, 'firstName' | 'lastName'>): string {
  return `${crew.firstName.charAt(0)}${crew.lastName.charAt(0)}`.toUpperCase()
}

/** Full name as shown in the directory and profile header. */
export function fullName(crew: Pick<CrewMember, 'firstName' | 'lastName'>): string {
  return `${crew.firstName} ${crew.lastName}`
}

/** `th, en` — the directory's language column. */
export function formatLanguages(languages: readonly string[]): string {
  return languages.join(', ')
}

/** `Thai · English` — the profile's language line, where codes are spelled out. */
const LANGUAGE_NAMES: Record<string, string> = {
  th: 'Thai',
  en: 'English',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
}

export function formatLanguageNames(languages: readonly string[]): string {
  return languages.map((code) => LANGUAGE_NAMES[code] ?? code.toUpperCase()).join(' · ')
}

/** `18 Apr 1994`, or an em dash when an optional field was left empty. */
export function optionalDate(date: LocalDate | null): string {
  return date ? formatDate(date) : '—'
}

/** `CNX → BKK`, the duty row's route. */
export function formatCrewRoute(origin: string, destination: string): string {
  return `${origin} → ${destination}`
}

/** `EMP-0018 · Captain · Base CNX · Fleet A320`, the profile header sub-line. */
export function formatProfileMeta(crew: CrewMember): string {
  return `${crew.employeeNo} · ${crew.role} · Base ${crew.base} · Fleet ${crew.fleet}`
}

/**
 * Local-crew eligibility, derived from the languages a crew member speaks.
 * A Thai base with Thai on the licence qualifies; everyone else falls back to
 * the country their base sits in, which is what the mockups show.
 */
export function localCrewEligibility(crew: Pick<CrewMember, 'baseCountry'>): string {
  return crew.baseCountry
}

/** Used until the backend's `expiry_warning_days` setting has loaded. */
export const DEFAULT_EXPIRY_WARNING_DAYS = 30

/** Licence health: expired, expiring within `warningDays`, or valid. */
export function licenceState(expiresOn: LocalDate, warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS): LicenceState {
  const remaining = daysUntil(expiresOn)
  if (remaining < 0) return 'expired'
  if (remaining <= warningDays) return 'expiring-soon'
  return 'valid'
}

/** `Licence expired`, appended to the hours column when a licence has lapsed. */
export function licenceWarning(expiresOn: LocalDate): string | null {
  return licenceState(expiresOn) === 'expired' ? 'Licence expired' : null
}

/**
 * `Valid until 15 Jan 2028` for a healthy rating, `Expires 28 Sep 2026 · in 14
 * days` when it is close. Past ones say `Expired on …`.
 */
export function describeCertification(certification: Certification, warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS): string {
  const remaining = daysUntil(certification.expiresOn)
  if (remaining < 0) return `Expired on ${formatDate(certification.expiresOn)}`
  if (remaining === 0) return `Expires today · ${formatDate(certification.expiresOn)}`
  if (remaining <= warningDays) return `Expires ${formatDate(certification.expiresOn)} · in ${remaining} days`
  return `Valid until ${formatDate(certification.expiresOn)}`
}

/** `EXPIRING SOON` / `EXPIRED` tag for a certification, or null when healthy. */
export function certificationTag(
  certification: Certification,
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS,
): 'warning' | 'invalid' | null {
  const remaining = daysUntil(certification.expiresOn)
  if (remaining < 0) return 'invalid'
  if (remaining <= warningDays) return 'warning'
  return null
}

/** Tone of the warning text under a certification. */
export function certificationIsUrgent(certification: Certification, warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS): boolean {
  return certificationTag(certification, warningDays) !== null
}

/** `64 / 100 h`, the directory's hours column. */
export function formatHours(crew: Pick<CrewMember, 'hours28d' | 'hoursCap'>): string {
  return `${crew.hours28d} / ${crew.hoursCap} h`
}
