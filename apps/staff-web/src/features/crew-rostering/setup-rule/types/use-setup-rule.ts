import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppAuth } from '../../../../auth/AuthProvider'
import { createSetupRuleApi } from './api'
import type {
  CountryLimit,
  CountryLimitInput,
  CountryLanguage,
  CountryLanguageInput,
  CountryOption,
  LanguageOption,
  LoadState,
  RuleSet,
} from './types'

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

/** The country code a working row refers to. An edit can move a row to another country, so the name wins over the stored code. */
function codeOf(row: { country: string; countryCode: string }, countries: readonly CountryOption[]): string {
  return countries.find((country) => country.name === row.country)?.code ?? row.countryCode
}

interface SavePlan {
  deleteLimits: string[]
  writeLimits: { create: boolean; code: string; body: { country: string; minRestHours: number; maxDutyHours: number } }[]
  deleteMappings: string[]
  writeMappings: { code: string; body: { country: string; languages: string[] } }[]
}

/**
 * What to send so the backend ends up equal to the working copy.
 *
 * Rows are matched by country code, not by id: ids are made up locally for new rows, and a row
 * edited onto a different country is a delete of the old country plus a write for the new one.
 */
function planSave(working: RuleSet, saved: RuleSet, countries: readonly CountryOption[]): SavePlan {
  const savedLimits = new Map(saved.countryLimits.map((limit) => [limit.countryCode, limit]))
  const workingLimits = new Map(working.countryLimits.map((limit) => [codeOf(limit, countries), limit]))
  const savedMappings = new Map(saved.countryLanguages.map((mapping) => [mapping.countryCode, mapping]))
  const workingMappings = new Map(working.countryLanguages.map((mapping) => [codeOf(mapping, countries), mapping]))

  return {
    deleteLimits: [...savedLimits.keys()].filter((code) => !workingLimits.has(code)),
    writeLimits: [...workingLimits].flatMap(([code, limit]) => {
      const before = savedLimits.get(code)
      if (before && sameLimit(limit, before)) return []
      return [
        { create: !before, code, body: { country: limit.country, minRestHours: limit.minRestHours, maxDutyHours: limit.maxDutyHours } },
      ]
    }),
    deleteMappings: [...savedMappings.keys()].filter((code) => !workingMappings.has(code)),
    writeMappings: [...workingMappings].flatMap(([code, mapping]) => {
      const before = savedMappings.get(code)
      if (before && sameMapping(mapping, before)) return []
      return [{ code, body: { country: mapping.country, languages: [...mapping.languages] } }]
    }),
  }
}

/**
 * Every piece of state the Rules page needs.
 *
 * The last saved snapshot is kept beside the working copy so the unsaved-changes
 * bar is derived rather than flagged by hand — an edit followed by an undo goes
 * quiet on its own.
 *
 * Reads `/api/crew-rostering/setup-rule` and writes only on save: the diff between the
 * working copy and the last saved snapshot becomes per-country calls, after which the
 * rules are read back so the affected-pairing and speaking-crew counts are the backend's.
 */
export function useSetupRule() {
  const { accessToken, fetchWithAuth } = useAppAuth()
  // `fetchWithAuth` is a new function on every provider render. Reading it through a ref
  // keeps `getApi` stable, so the load effect runs once per session, not on every render.
  const fetchRef = useRef(fetchWithAuth)
  useEffect(() => {
    fetchRef.current = fetchWithAuth
  }, [fetchWithAuth])
  const getApi = useCallback(() => createSetupRuleApi(fetchRef.current), [])
  const signedIn = accessToken !== null

  const [rules, setRules] = useState<RuleSet | null>(null)
  const [saved, setSaved] = useState<RuleSet | null>(null)
  const [countries, setCountries] = useState<readonly CountryOption[]>([])
  const [languages, setLanguages] = useState<readonly LanguageOption[]>([])
  // Starts loading: the first request fires as soon as the session is ready.
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [justSaved, setJustSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!signedIn) return
    let active = true
    const api = getApi()
    Promise.all([api.getRuleSet(), api.listCountries(), api.listLanguages()])
      .then(([loadedRules, loadedCountries, loadedLanguages]) => {
        if (!active) return
        setRules(loadedRules)
        setSaved(loadedRules)
        setCountries(loadedCountries)
        setLanguages(loadedLanguages)
        setLoadState('idle')
      })
      .catch(() => {
        if (active) setLoadState('error')
      })
    return () => {
      active = false
    }
  }, [getApi, signedIn])

  const limitsChangeCount = useMemo(
    () => (rules && saved ? countChanges(rules.countryLimits, saved.countryLimits, sameLimit) : 0),
    [rules, saved],
  )
  const languagesChangeCount = useMemo(
    () => (rules && saved ? countChanges(rules.countryLanguages, saved.countryLanguages, sameMapping) : 0),
    [rules, saved],
  )

  function addCountryLimit(input: CountryLimitInput) {
    const country = countries.find((entry) => entry.name === input.country)
    if (!country) return
    // The pairing count is the backend's to work out; it replaces this once the rule is saved.
    const limit: CountryLimit = {
      id: `RL-${country.code}-LOCAL`,
      country: country.name,
      countryCode: country.code,
      minRestHours: Number(input.minRestHours),
      maxDutyHours: Number(input.maxDutyHours),
      affectedPairings: 0,
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
    const country = countries.find((entry) => entry.name === input.country)
    if (!country) return
    // The speaking-crew count is the backend's to work out; it replaces this once the mapping is saved.
    const mapping: CountryLanguage = {
      id: `CL-${country.code}-LOCAL`,
      country: country.name,
      countryCode: country.code,
      languages: [...input.languages],
      speakingCrew: 0,
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

  /**
   * Sends what differs from the last save, then reads the rules back.
   *
   * Removals go first so a country moved onto a freed one cannot collide. If a call is
   * refused the rest are skipped, the snapshot is re-read so it matches what the backend
   * actually kept, and the working copy stays as the operator left it, so the unsaved
   * bar still counts whatever did not make it.
   */
  async function saveRules() {
    if (!rules || !saved || isSaving) return
    setIsSaving(true)
    setSaveError(null)
    const api = getApi()
    const plan = planSave(rules, saved, countries)

    try {
      for (const code of plan.deleteLimits) await api.deleteCountryLimit(code)
      for (const code of plan.deleteMappings) await api.deleteCountryLanguages(code)
      for (const write of plan.writeLimits) {
        if (write.create) await api.createCountryLimit(write.body)
        else await api.updateCountryLimit(write.code, write.body)
      }
      for (const write of plan.writeMappings) await api.upsertCountryLanguages(write.code, write.body)

      const reloaded = await api.getRuleSet()
      setRules(reloaded)
      setSaved(reloaded)
      setJustSaved(true)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the rules. Try again shortly.')
      await api
        .getRuleSet()
        .then(setSaved)
        .catch(() => undefined)
    } finally {
      setIsSaving(false)
    }
  }

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
    countries,
    languages,
    loadState,
    justSaved,
    isSaving,
    saveError,
    dismissSaveError: () => setSaveError(null),
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
