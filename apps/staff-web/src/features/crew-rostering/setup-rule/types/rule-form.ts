import type {
  CountryLimit,
  CountryLimitErrors,
  CountryLimitInput,
  CountryLanguage,
  CountryLanguageErrors,
  CountryLanguageInput,
  DefaultLimits,
} from './types'

/** Seed values for the add overlays: the baseline limits and no country picked. */
export const EMPTY_COUNTRY_LIMIT_FORM: CountryLimitInput = {
  country: '',
  minRestHours: '',
  maxDutyHours: '',
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
  }
}

export function toCountryLanguageForm(mapping: CountryLanguage): CountryLanguageInput {
  return {
    country: mapping.country,
    languages: [...mapping.languages],
  }
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
export function hasErrors(errors: CountryLimitErrors | CountryLanguageErrors): boolean {
  return Object.keys(errors).length > 0
}
