import type {
  CountryLimit,
  CountryLimitErrors,
  CountryLimitInput,
  CountryLanguage,
  CountryLanguageErrors,
  CountryLanguageInput,
  DefaultLimits,
  DefaultLimitsErrors,
  DefaultLimitsInput,
} from './types'

/** Seed values for the add overlays: the baseline limits and no country picked. */
export const EMPTY_COUNTRY_LIMIT_FORM: CountryLimitInput = {
  country: '',
  minRestHours: '',
  maxDutyHours: '',
  minLocalCrew: '',
}

export const EMPTY_COUNTRY_LANGUAGE_FORM: CountryLanguageInput = {
  country: '',
  languages: [],
}

/** Seeds the edit overlay from a stored rule. */
export function toCountryLimitForm(limit: CountryLimit): CountryLimitInput {
  return {
    country: limit.country,
    minRestHours: String(limit.minRestHours),
    maxDutyHours: String(limit.maxDutyHours),
    minLocalCrew: String(limit.minLocalCrew),
  }
}

export function toCountryLanguageForm(mapping: CountryLanguage): CountryLanguageInput {
  return {
    country: mapping.country,
    languages: [...mapping.languages],
  }
}

/** Seeds the edit default limits overlay from the stored baseline. */
export function toDefaultLimitsForm(defaults: DefaultLimits): DefaultLimitsInput {
  return {
    minRestHours: String(defaults.minRestHours),
    maxDutyHours: String(defaults.maxDutyHours),
    maxFlightsPerDuty: String(defaults.maxFlightsPerDuty),
    maxPairingDays: String(defaults.maxPairingDays),
    hoursCap28d: String(defaults.hoursCap28d),
    minLocalCrew: String(defaults.minLocalCrew),
  }
}

/** A head count: a whole number, 0 allowed (no local speaker needed). */
function isCount(value: string): boolean {
  const trimmed = value.trim()
  return trimmed !== '' && Number.isInteger(Number(trimmed)) && Number(trimmed) >= 0
}

/**
 * Reads an hours field.
 *
 * Returns null for anything that is not a positive whole number so the caller
 * can tell "not typed" apart from "typed wrong", which carry different messages.
 */
function parseHours(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Client-side checks for the country rule overlay.
 *
 * These are UX, not security: the backend re-validates everything. The rule the
 * spec states is "at least as strict as the default" — rest can only go up and
 * duty can only go down, so loosening either is rejected here.
 *
 * `takenCountries` is the set already carrying a rule, so a destination cannot be
 * added twice. In edit mode the caller leaves its own country out of the set.
 */
export function validateCountryLimit(
  input: CountryLimitInput,
  defaults: DefaultLimits,
  takenCountries: readonly string[] = [],
): CountryLimitErrors {
  const errors: CountryLimitErrors = {}

  if (!input.country) errors.country = 'Required.'
  else if (takenCountries.some((taken) => taken.toLowerCase() === input.country.toLowerCase())) errors.country = 'Already has a rule.'

  const minRest = parseHours(input.minRestHours)
  if (minRest === null) errors.minRestHours = 'Enter whole hours.'
  else if (minRest < defaults.minRestHours) errors.minRestHours = `Cannot be below the ${defaults.minRestHours} h default.`

  const maxDuty = parseHours(input.maxDutyHours)
  if (maxDuty === null) errors.maxDutyHours = 'Enter whole hours.'
  else if (maxDuty > defaults.maxDutyHours) errors.maxDutyHours = `Cannot be above the ${defaults.maxDutyHours} h default.`

  if (!isCount(input.minLocalCrew)) errors.minLocalCrew = 'Enter a whole number, 0 or more.'

  return errors
}

/**
 * Client-side checks for the default limits overlay. The backend repeats them.
 *
 * A country rule may only tighten the baseline, so the baseline cannot move past one: rest cannot go
 * above the shortest rest any country asks for, and duty cannot go below the longest duty any country allows.
 */
export function validateDefaultLimits(input: DefaultLimitsInput, countryLimits: readonly CountryLimit[]): DefaultLimitsErrors {
  const errors: DefaultLimitsErrors = {}

  const minRest = parseHours(input.minRestHours)
  if (minRest === null) errors.minRestHours = 'Enter whole hours.'
  else if (minRest > 24) errors.minRestHours = 'At most 24 h.'
  else {
    const tighter = countryLimits.find((limit) => limit.minRestHours < minRest)
    if (tighter) errors.minRestHours = `${tighter.country} asks for ${tighter.minRestHours} h. Change that rule first.`
  }

  const maxDuty = parseHours(input.maxDutyHours)
  if (maxDuty === null) errors.maxDutyHours = 'Enter whole hours.'
  else if (maxDuty > 24) errors.maxDutyHours = 'At most 24 h.'
  else {
    const tighter = countryLimits.find((limit) => limit.maxDutyHours > maxDuty)
    if (tighter) errors.maxDutyHours = `${tighter.country} allows ${tighter.maxDutyHours} h. Change that rule first.`
  }

  if (parseHours(input.maxFlightsPerDuty) === null) errors.maxFlightsPerDuty = 'Enter a whole number.'
  if (parseHours(input.maxPairingDays) === null) errors.maxPairingDays = 'Enter a whole number.'

  const cap = parseHours(input.hoursCap28d)
  if (cap === null) errors.hoursCap28d = 'Enter whole hours.'
  else if (cap > 1000) errors.hoursCap28d = 'At most 1000 h.'

  if (!isCount(input.minLocalCrew)) errors.minLocalCrew = 'Enter a whole number, 0 or more.'

  return errors
}

/**
 * Client-side checks for the country language overlay. A mapping with no
 * accepted language could never match any crew, so it is rejected rather than
 * saved as a dead rule.
 */
export function validateCountryLanguage(input: CountryLanguageInput, takenCountries: readonly string[] = []): CountryLanguageErrors {
  const errors: CountryLanguageErrors = {}

  if (!input.country) errors.country = 'Required.'
  else if (takenCountries.some((taken) => taken.toLowerCase() === input.country.toLowerCase())) errors.country = 'Already mapped.'
  if (input.languages.length === 0) errors.languages = 'Pick at least one language.'

  return errors
}

/** True when nothing is wrong. Kept next to the validators so the two agree. */
export function hasErrors(errors: CountryLimitErrors | CountryLanguageErrors | DefaultLimitsErrors): boolean {
  return Object.keys(errors).length > 0
}
