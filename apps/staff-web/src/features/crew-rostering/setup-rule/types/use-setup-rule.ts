import { useCallback, useEffect, useMemo, useState } from 'react'
import { MOCK_COUNTRIES, MOCK_LANGUAGES, MOCK_AFFECTED_PAIRINGS, MOCK_SPEAKING_CREW, loadRules } from './mock-data'
import type { CountryLimit, CountryLimitInput, CountryLanguage, CountryLanguageInput, LoadState, RuleSet } from './types'

/**
 * Counts rows that were added, edited or dropped since the last save.
 *
 * Compare by id so a row that was touched and then reverted counts as clean
 * again, which is what the operator expects from an unsaved-changes bar.
 */
function countChanges<T extends { id: string }>(current: readonly T[], saved: readonly T[], isUnchanged: (a: T, b: T) => boolean): number {
  const savedById = new Map(saved.map((row) => [row.id, row]))
  const currentIds = new Set(current.map((row) => row.id))

  let changed = 0
  for (const row of current) {
    const before = savedById.get(row.id)
    if (!before || !isUnchanged(row, before)) changed += 1
  }
  for (const row of saved) {
    if (!currentIds.has(row.id)) changed += 1
  }
  return changed
}

function sameLimit(a: CountryLimit, b: CountryLimit): boolean {
  return a.country === b.country && a.minRestHours === b.minRestHours && a.maxDutyHours === b.maxDutyHours
}

function sameMapping(a: CountryLanguage, b: CountryLanguage): boolean {
  return a.country === b.country && a.languages.join(',') === b.languages.join(',')
}

/**
 * Every piece of state the Rules page needs.
 *
 * The last saved snapshot is kept beside the working copy so the unsaved-changes
 * bar is derived rather than flagged by hand — an edit followed by an undo goes
 * quiet on its own. `loadRules` is the single seam a backend replaces.
 */
export function useSetupRule() {
  const [rules, setRules] = useState<RuleSet | null>(null)
  const [saved, setSaved] = useState<RuleSet | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    let active = true
    loadRules().then((loaded) => {
      if (!active) return
      setRules(loaded)
      setSaved(loaded)
      setLoadState('idle')
    })
    return () => {
      active = false
    }
  }, [])

  const limitsChangeCount = useMemo(
    () => (rules && saved ? countChanges(rules.countryLimits, saved.countryLimits, sameLimit) : 0),
    [rules, saved],
  )
  const languagesChangeCount = useMemo(
    () => (rules && saved ? countChanges(rules.countryLanguages, saved.countryLanguages, sameMapping) : 0),
    [rules, saved],
  )

  function addCountryLimit(input: CountryLimitInput) {
    const country = MOCK_COUNTRIES.find((entry) => entry.name === input.country)
    if (!country) return
    const limit: CountryLimit = {
      id: `RL-${country.code}-LOCAL`,
      country: country.name,
      countryCode: country.code,
      minRestHours: Number(input.minRestHours),
      maxDutyHours: Number(input.maxDutyHours),
      affectedPairings: MOCK_AFFECTED_PAIRINGS[country.code] ?? 0,
    }
    setRules((current) => (current ? { ...current, countryLimits: [...current.countryLimits, limit] } : current))
  }

  function updateCountryLimit(id: string, input: CountryLimitInput) {
    setRules((current) =>
      current
        ? {
            ...current,
            countryLimits: current.countryLimits.map((limit) =>
              limit.id === id
                ? { ...limit, country: input.country, minRestHours: Number(input.minRestHours), maxDutyHours: Number(input.maxDutyHours) }
                : limit,
            ),
          }
        : current,
    )
  }

  function removeCountryLimit(id: string) {
    setRules((current) => (current ? { ...current, countryLimits: current.countryLimits.filter((limit) => limit.id !== id) } : current))
  }

  function addCountryLanguage(input: CountryLanguageInput) {
    const country = MOCK_COUNTRIES.find((entry) => entry.name === input.country)
    if (!country) return
    const mapping: CountryLanguage = {
      id: `CL-${country.code}-LOCAL`,
      country: country.name,
      countryCode: country.code,
      languages: [...input.languages],
      speakingCrew: MOCK_SPEAKING_CREW[country.code] ?? 0,
    }
    setRules((current) => (current ? { ...current, countryLanguages: [...current.countryLanguages, mapping] } : current))
  }

  function updateCountryLanguage(id: string, input: CountryLanguageInput) {
    setRules((current) =>
      current
        ? {
            ...current,
            countryLanguages: current.countryLanguages.map((mapping) =>
              mapping.id === id ? { ...mapping, country: input.country, languages: [...input.languages] } : mapping,
            ),
          }
        : current,
    )
  }

  function removeCountryLanguage(id: string) {
    setRules((current) =>
      current ? { ...current, countryLanguages: current.countryLanguages.filter((mapping) => mapping.id !== id) } : current,
    )
  }

  /** Commits the working copy and raises the success overlay. */
  const saveRules = useCallback(() => {
    setSaved(rules)
    setJustSaved(true)
  }, [rules])

  const discardChanges = useCallback(() => {
    setRules(saved)
  }, [saved])

  const dismissSavedModal = useCallback(() => setJustSaved(false), [])

  /** Countries already carrying a rule or a mapping, minus the row being edited. */
  const countriesWithLimit = useCallback(
    (exceptId?: string) => (rules?.countryLimits ?? []).filter((limit) => limit.id !== exceptId).map((limit) => limit.country),
    [rules],
  )
  const countriesWithMapping = useCallback(
    (exceptId?: string) => (rules?.countryLanguages ?? []).filter((mapping) => mapping.id !== exceptId).map((mapping) => mapping.country),
    [rules],
  )

  return {
    rules,
    defaults: rules?.defaults ?? null,
    companyRules: rules?.companyRules ?? [],
    countryLimits: rules?.countryLimits ?? [],
    countryLanguages: rules?.countryLanguages ?? [],
    countries: MOCK_COUNTRIES,
    languages: MOCK_LANGUAGES,
    loadState,
    justSaved,
    limitsChangeCount,
    languagesChangeCount,
    addCountryLimit,
    updateCountryLimit,
    removeCountryLimit,
    addCountryLanguage,
    updateCountryLanguage,
    removeCountryLanguage,
    countriesWithLimit,
    countriesWithMapping,
    saveRules,
    discardChanges,
    dismissSavedModal,
  }
}
