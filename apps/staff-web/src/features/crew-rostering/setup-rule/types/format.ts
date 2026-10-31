import type { CountryLanguage, DefaultLimits, LanguageOption } from './types'

/** `10 h` — every duration on this page is written with the unit attached. */
export function formatHours(hours: number): string {
  return `${hours} h`
}

/** `11 h min rest · 13 h max duty`, the remove-confirmation summary line. */
export function formatLimitPair(minRestHours: number, maxDutyHours: number): string {
  return `${formatHours(minRestHours)} min rest · ${formatHours(maxDutyHours)} max duty`
}

/**
 * `Japanese · English` — the table cell.
 *
 * Codes are mapped back to their names because a destination is read by people,
 * and the codes only make sense inside the picker.
 */
export function formatLanguageNames(codes: readonly string[], languages: readonly LanguageOption[]): string {
  return codes.map((code) => languages.find((language) => language.code === code)?.name ?? code).join(' · ')
}

/** `Japanese, English` — how the multi-select summarises the same list. */
export function formatLanguageList(codes: readonly string[], languages: readonly LanguageOption[]): string {
  return codes.map((code) => languages.find((language) => language.code === code)?.name ?? code).join(', ')
}

/** `4 crew` / `1 crew` — the count of crew who speak a destination's languages. */
export function formatCrewCount(count: number): string {
  return `${count} crew`
}

/** `All pairings` for the baseline row, `4 pairings` for a destination rule. */
export function formatPairings(count: number | null): string {
  return count === null ? 'All pairings' : `${count} pairings`
}

/** `max 3 days · return to base`, the note under the default-limit cards. */
export function formatPairingLimit(defaults: DefaultLimits): string {
  return `Pairing limits: max ${defaults.maxPairingDays} days · return to base`
}

/** `JP · Japanese · Active`, the destination line on a mobile card. */
export function formatMobileMappingSubline(mapping: CountryLanguage, languages: readonly LanguageOption[]): string {
  return `${mapping.countryCode} · ${formatLanguageList(mapping.languages, languages)} · Active`
}
