import type { CompanyRule, CountryLimit, CountryLanguage, DefaultLimits, LanguageOption, RuleSet } from './types'

/**
 * Placeholder rule data for the setup-rule page.
 *
 * This is the only module that fakes data. When the backend lands, replace
 * `loadRules` with a fetch (later a TanStack Query call) and leave every other
 * module alone: the types already match an API payload and no component imports
 * this file.
 */

/** Baseline applied to every country before a destination rule is considered. */
export const MOCK_DEFAULT_LIMITS: DefaultLimits = {
  minRestHours: 10,
  maxDutyHours: 13,
  maxFlightsPerDuty: 4,
  maxPairingDays: 3,
  hoursCap28d: 100,
}

/** Company policy lines. Overridable with a written reason, unlike the limits. */
export const MOCK_COMPANY_RULES: readonly CompanyRule[] = [
  { id: 'COMP-1', label: '1+ local crew per destination' },
  { id: 'COMP-2', label: '2 police · international flights' },
  { id: 'COMP-3', label: 'Police need a seat from Feature 3', code: 'POLICE_NO_SEAT' },
]

/**
 * Destinations with a rule tighter than the baseline.
 *
 * Thailand carries 10 h / 13 h — the same numbers as the default — so the table
 * shows a country that overrides without actually tightening, which is the edge
 * the validation rules have to survive.
 */
export const MOCK_COUNTRY_LIMITS: readonly CountryLimit[] = [
  { id: 'RL-JP', country: 'Japan', countryCode: 'JP', minRestHours: 11, maxDutyHours: 13, affectedPairings: 4 },
  { id: 'RL-KR', country: 'South Korea', countryCode: 'KR', minRestHours: 12, maxDutyHours: 12, affectedPairings: 3 },
  { id: 'RL-TH', country: 'Thailand', countryCode: 'TH', minRestHours: 10, maxDutyHours: 13, affectedPairings: 6 },
]

/** Destination language mappings, with the crew count each one covers. */
export const MOCK_COUNTRY_LANGUAGES: readonly CountryLanguage[] = [
  { id: 'CL-JP', country: 'Japan', countryCode: 'JP', languages: ['ja', 'en'], speakingCrew: 4 },
  { id: 'CL-KR', country: 'South Korea', countryCode: 'KR', languages: ['ko', 'en'], speakingCrew: 2 },
  { id: 'CL-TH', country: 'Thailand', countryCode: 'TH', languages: ['th', 'en'], speakingCrew: 11 },
  { id: 'CL-SG', country: 'Singapore', countryCode: 'SG', languages: ['en', 'zh'], speakingCrew: 5 },
]

/** Destinations an operator can add a rule or mapping for. */
export const MOCK_COUNTRIES = [
  { name: 'Japan', code: 'JP' },
  { name: 'South Korea', code: 'KR' },
  { name: 'Thailand', code: 'TH' },
  { name: 'Singapore', code: 'SG' },
  { name: 'China', code: 'CN' },
  { name: 'Vietnam', code: 'VN' },
  { name: 'Malaysia', code: 'MY' },
  { name: 'Indonesia', code: 'ID' },
] as const satisfies readonly { name: string; code: string }[]

/** Languages an operator can mark as local at a destination. */
export const MOCK_LANGUAGES = [
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'th', name: 'Thai' },
  { code: 'en', name: 'English' },
  { code: 'zh', name: 'Mandarin' },
  { code: 'ms', name: 'Malay' },
  { code: 'vi', name: 'Vietnamese' },
] as const satisfies readonly LanguageOption[]

/** Stand-in for the rules fetch. */
export function loadRules(): Promise<RuleSet> {
  return Promise.resolve({
    defaults: { ...MOCK_DEFAULT_LIMITS },
    companyRules: MOCK_COMPANY_RULES.map((rule) => ({ ...rule })),
    countryLimits: MOCK_COUNTRY_LIMITS.map((limit) => ({ ...limit })),
    countryLanguages: MOCK_COUNTRY_LANGUAGES.map((mapping) => ({ ...mapping, languages: [...mapping.languages] })),
  })
}

/**
 * Counts the page shows next to a destination it has never seen before.
 *
 * A real backend answers these with the number of pairings and crew a new rule
 * would touch. The mock has no roster behind it, so the lookup stands in; a
 * country missing from it reads as zero rather than inventing a number.
 */
export const MOCK_AFFECTED_PAIRINGS: Record<string, number> = {
  JP: 4,
  KR: 3,
  TH: 6,
  SG: 5,
  CN: 8,
  VN: 2,
  MY: 3,
  ID: 4,
}

export const MOCK_SPEAKING_CREW: Record<string, number> = {
  JP: 4,
  KR: 2,
  TH: 11,
  SG: 5,
  CN: 7,
  VN: 3,
  MY: 6,
  ID: 4,
}
