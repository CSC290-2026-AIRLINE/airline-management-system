/**
 * Small formatters the fix workspace shares. The sentences themselves come from the
 * backend, which writes each item once so the list, the panel and the closed table
 * quote the same words.
 */
import { ROSTER_TIME_ZONE } from '../../build-pairings/types/format'
import type { CrewMember, CrewRole, FixBreak, LegAssignment } from './types'

/** `15 Sep` — the day without the weekday, which the table's flight cell prints. */
const dayMonthFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: ROSTER_TIME_ZONE })

export function dayMonth(instant: string): string {
  return dayMonthFormatter.format(new Date(instant)).replace('Sept', 'Sep')
}

export const ROLE_LABELS: Record<CrewRole, string> = {
  captain: 'Captain',
  first_officer: 'First officer',
  cabin_crew: 'Cabin crew',
  police: 'Police',
}

/** Every crew member on a leg with the seat they occupy, for the sick-call picker. */
export function crewOn(assignment: LegAssignment): { member: CrewMember; role: CrewRole }[] {
  return [
    ...(assignment.captain ? [{ member: assignment.captain, role: 'captain' as const }] : []),
    ...(assignment.firstOfficer ? [{ member: assignment.firstOfficer, role: 'first_officer' as const }] : []),
    ...assignment.cabinCrew.map((member) => ({ member, role: 'cabin_crew' as const })),
    ...assignment.police.map((member) => ({ member, role: 'police' as const })),
  ]
}

/** The plain-English name of a break, for places that show it beside the code. */
const BREAK_NOUNS: Record<string, string> = {
  REST_SHORT: 'minimum rest not met',
  HOURS_28D: '28-day flight hours exceeded',
  OVERLAP: 'crew on two flights at once',
  DUTY_LIMIT: 'duty limit exceeded',
  NO_LEGAL_CREW: 'seat not filled',
  LICENCE_EXPIRED: 'licence expired',
  NO_TYPE_RATING: 'no type rating',
  WRONG_FLEET: 'crew on the wrong fleet',
  POLICE_MIN: 'police minimum not met',
  POLICE_NO_SEAT: 'no seat for police',
  NO_LOCAL_CREW: 'destination language not spoken',
}

export function breakNoun(code: string): string {
  return BREAK_NOUNS[code] ?? 'rule break'
}

/** How the item reads in the left list. A seat somebody came off reads as a sick call. */
export function listLabel(item: FixBreak): string {
  return item.removed ? `Sick call · ${item.flightNumber}` : item.code
}

const LANGUAGE_NAMES: Record<string, string> = {
  ko: 'Korean',
  ja: 'Japanese',
  th: 'Thai',
  zh: 'Chinese',
  en: 'English',
  ms: 'Malay',
  id: 'Indonesian',
  vi: 'Vietnamese',
}

/** `ko` → `Korean`, for the line under a candidate's name. */
export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase()
}

const COUNTRY_BY_LANGUAGE: Record<string, string> = { ja: 'JP', ko: 'KR', th: 'TH', zh: 'CN', en: 'GB', ms: 'MY', id: 'ID', vi: 'VN' }

/** The country tag beside a local-crew name, e.g. `JP`. */
export function countryTag(code: string): string {
  return COUNTRY_BY_LANGUAGE[code] ?? code.toUpperCase()
}

const dayMonthYearFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: ROSTER_TIME_ZONE,
})

/** `15 Sep 2026`, the date column of the closed-breaks table. */
export function dayMonthYear(instant: string): string {
  return dayMonthYearFormatter.format(new Date(instant)).replace('Sept', 'Sep')
}
