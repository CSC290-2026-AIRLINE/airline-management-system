/**
 * Domain model for the Rules setup page.
 *
 * The page edits two independent sets — the legality limits and the
 * destination-language mappings — and both are returned by one endpoint in the
 * future, so `loadRules` hands back a single `RuleSet`.
 */

/** Which of the two tab groups the page is showing. */
export type RuleTab = 'legality' | 'languages'

/**
 * The baseline every destination starts from. A country rule can only tighten
 * these values, never loosen them.
 */
export interface DefaultLimits {
  minRestHours: number
  maxDutyHours: number
  maxFlightsPerDuty: number
  maxPairingDays: number
  hoursCap28d: number
}

/**
 * A company policy line. These are overridable with a written reason, unlike the
 * legality limits above them — the wording on the card is what makes that clear.
 */
export interface CompanyRule {
  id: string
  label: string
  /** Short reason code shown where the spec names one, e.g. `POLICE_NO_SEAT`. */
  code?: string
}

/** A destination that limits rest or duty more tightly than the baseline. */
export interface CountryLimit {
  id: string
  country: string
  countryCode: string
  minRestHours: number
  maxDutyHours: number
  /** Pairings that would be re-checked if this rule changed. */
  affectedPairings: number
}

/** A destination and the languages that count as local there. */
export interface CountryLanguage {
  id: string
  country: string
  countryCode: string
  /** Language codes, in the order the operator picked them. */
  languages: readonly string[]
  /** Crew in the system who speak at least one of them. */
  speakingCrew: number
}

/** Everything the page loads, edits and saves. */
export interface RuleSet {
  defaults: DefaultLimits
  companyRules: readonly CompanyRule[]
  countryLimits: readonly CountryLimit[]
  countryLanguages: readonly CountryLanguage[]
}

export type LoadState = 'loading' | 'idle' | 'error'

/** Form state for the add/edit country rule overlay. Hours stay as strings. */
export interface CountryLimitInput {
  country: string
  minRestHours: string
  maxDutyHours: string
}

export type CountryLimitErrors = Partial<Record<keyof CountryLimitInput, string>>

/** Form state for the add/edit country language overlay. */
export interface CountryLanguageInput {
  country: string
  languages: string[]
}

export type CountryLanguageErrors = Partial<Record<keyof CountryLanguageInput, string>>

/** A destination the operator can pick, with the code shown on mobile cards. */
export interface CountryOption {
  name: string
  code: string
}

/** A language the operator can mark as local at a destination. */
export interface LanguageOption {
  code: string
  name: string
}
