import { requestJson, requestVoid, type FetchWithAuth } from '../../build-pairings/types/api'
import type { CountryLanguage, CountryLimit, CountryOption, LanguageOption, RuleSet } from './types'

/**
 * Calls to `/api/crew-rostering/setup-rule`, through `fetchWithAuth` so every request
 * carries the staff access token. No cache: the page hook owns its state until the
 * shared TanStack Query setup lands.
 *
 * The backend stores one row per country, so a save is a handful of per-country calls
 * rather than one bulk write. A country is addressed by its ISO code in the path.
 */

const BASE_PATH = '/api/crew-rostering/setup-rule'

export interface CountryLimitBody {
  /** Country name; the backend resolves it to a code. */
  country: string
  minRestHours: number
  maxDutyHours: number
}

export interface CountryLanguageBody {
  country: string
  languages: string[]
}

export function createSetupRuleApi(fetchWithAuth: FetchWithAuth) {
  const request = <T>(path: string, init?: RequestInit) => requestJson<T>(fetchWithAuth, `${BASE_PATH}${path}`, init)
  const remove = (path: string) => requestVoid(fetchWithAuth, `${BASE_PATH}${path}`, { method: 'DELETE' })
  const send = (method: 'POST' | 'PUT', body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

  return {
    /** Both tabs load from this one call. */
    getRuleSet: () => request<RuleSet>(''),
    listCountries: () => request<CountryOption[]>('/countries'),
    listLanguages: () => request<LanguageOption[]>('/languages'),

    createCountryLimit: (body: CountryLimitBody) => request<CountryLimit>('/country-limits', send('POST', body)),
    updateCountryLimit: (countryCode: string, body: CountryLimitBody) =>
      request<CountryLimit>(`/country-limits/${countryCode}`, send('PUT', body)),
    deleteCountryLimit: (countryCode: string) => remove(`/country-limits/${countryCode}`),

    upsertCountryLanguages: (countryCode: string, body: CountryLanguageBody) =>
      request<CountryLanguage>(`/country-languages/${countryCode}`, send('PUT', body)),
    deleteCountryLanguages: (countryCode: string) => remove(`/country-languages/${countryCode}`),
  }
}
