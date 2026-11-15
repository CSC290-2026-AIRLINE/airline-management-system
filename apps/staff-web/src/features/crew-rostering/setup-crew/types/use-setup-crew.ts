import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppAuth } from '../../../../auth/AuthProvider'
import { createSetupCrewApi, type SetupCrewOptions } from './api'
import { DEFAULT_EXPIRY_WARNING_DAYS, fullName } from './format'
import type { CertificationInput, CrewFilters, CrewMember, CrewMetrics, CrewProfileInput, PageNotice } from './types'
import { PILOT_ROLES } from './types'

export type LoadState = 'idle' | 'loading' | 'error'

const EMPTY_FILTERS: CrewFilters = { search: '', base: 'all', role: 'all' }

const NO_OPTIONS: SetupCrewOptions = { bases: [], fleets: [], languages: [] }

export interface SetupCrewState {
  crew: CrewMember[]
  /** `crew` narrowed by the filter bar. The table renders this, nothing else. */
  visibleCrew: CrewMember[]
  metrics: CrewMetrics
  filters: CrewFilters
  bases: readonly string[]
  fleets: readonly string[]
  languages: readonly { code: string; label: string }[]
  loadState: LoadState
  notice: PageNotice | null
  /** Days before expiry that a licence or certification shows as expiring soon (`crew_setting`). */
  expiryWarningDays: number
  /** Employee number the create modal pre-fills, e.g. `EMP-2202`. */
  suggestedEmployeeNo: string
  /** Employee numbers not owned by `crewId`, for the edit form's uniqueness check. */
  employeeNumbersInUse: (crewId: string | null) => string[]
  setSearch: (value: string) => void
  setBase: (value: string) => void
  setRole: (value: string) => void
  clearFilters: () => void
  /** Each write resolves `true` once the backend has saved it, `false` after a failure has been shown as a notice. */
  createCrew: (input: CrewProfileInput) => Promise<boolean>
  updateCrew: (crewId: string, input: CrewProfileInput) => Promise<boolean>
  addCertification: (crewId: string, input: CertificationInput) => Promise<boolean>
  updateCertification: (crewId: string, certificationId: string, input: CertificationInput) => Promise<boolean>
  removeCertification: (crewId: string, certificationId: string) => Promise<boolean>
  dismissNotice: () => void
}

/**
 * All setup-crew state in one place.
 *
 * Reads the directory and the pickers from `/api/crew-rostering/setup-crew` and writes
 * every change there first, so what the table shows is what the backend stored. The
 * backend also recomputes the 28-day hours, licence health and upcoming duties, which
 * is why an edit replaces the whole row with the answer instead of patching it locally.
 *
 * Filters are held here rather than in the table because the metric cards count
 * the whole roster, not the visible rows — keeping both in one place makes that
 * difference obvious.
 */
export function useSetupCrew(): SetupCrewState {
  const { accessToken, fetchWithAuth } = useAppAuth()
  // `fetchWithAuth` is a new function on every provider render. Reading it through a ref
  // keeps `getApi` stable, so the load effect runs once per session, not on every render.
  const fetchRef = useRef(fetchWithAuth)
  useEffect(() => {
    fetchRef.current = fetchWithAuth
  }, [fetchWithAuth])
  const getApi = useCallback(() => createSetupCrewApi(fetchRef.current), [])
  const signedIn = accessToken !== null

  const [crew, setCrew] = useState<CrewMember[]>([])
  const [options, setOptions] = useState<SetupCrewOptions>(NO_OPTIONS)
  const [expiryWarningDays, setExpiryWarningDays] = useState(DEFAULT_EXPIRY_WARNING_DAYS)
  const [suggestedEmployeeNo, setSuggestedEmployeeNo] = useState('')
  const [filters, setFilters] = useState<CrewFilters>(EMPTY_FILTERS)
  // The first fetch starts as soon as the session is ready, so the initial state is
  // already `loading`. Setting it from the effect body would be a second render
  // for no reason, and React's own lint rule rejects it.
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [notice, setNotice] = useState<PageNotice | null>(null)

  useEffect(() => {
    if (!signedIn) return
    let active = true
    const api = getApi()
    Promise.all([api.listCrew(), api.listOptions(), api.suggestEmployeeNo().catch(() => '')])
      .then(([directory, loadedOptions, suggestion]) => {
        if (!active) return
        setCrew(directory.crew)
        setExpiryWarningDays(directory.expiryWarningDays)
        setOptions(loadedOptions)
        setSuggestedEmployeeNo(suggestion)
        setLoadState('idle')
      })
      .catch(() => {
        if (active) setLoadState('error')
      })
    return () => {
      active = false
    }
  }, [getApi, signedIn])

  const visibleCrew = useMemo(() => {
    const term = filters.search.trim().toLowerCase()
    return crew.filter((member) => {
      if (filters.base !== 'all' && member.base !== filters.base) return false
      if (filters.role !== 'all' && member.role !== filters.role) return false
      if (!term) return true
      return fullName(member).toLowerCase().includes(term) || member.employeeNo.toLowerCase().includes(term)
    })
  }, [crew, filters])

  // Counted over `crew`, so narrowing the table never moves the headline totals.
  const metrics = useMemo<CrewMetrics>(
    () => ({
      totalCrew: crew.length,
      pilots: crew.filter((member) => PILOT_ROLES.includes(member.role)).length,
      cabinCrew: crew.filter((member) => member.role === 'Cabin Crew').length,
      flightPolice: crew.filter((member) => member.role === 'Flight Police').length,
    }),
    [crew],
  )

  function patchCrew(crewId: string, update: (member: CrewMember) => CrewMember) {
    setCrew((current) => current.map((member) => (member.id === crewId ? update(member) : member)))
  }

  /** Runs one backend write. A failure becomes a notice carrying the backend's reason, never an unhandled rejection. */
  async function save(action: () => Promise<void>): Promise<boolean> {
    try {
      await action()
      return true
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Please try again.'
      setNotice({ message: `Could not save · ${reason}`, shortMessage: 'Could not save' })
      return false
    }
  }

  const createCrew = (input: CrewProfileInput) =>
    save(async () => {
      const api = getApi()
      const created = await api.createCrew(input)
      setCrew((current) => [{ ...created, justCreated: true }, ...current])
      setNotice({
        message: `Crew profile created · ${fullName(created)} (${created.employeeNo}) can now be auto-assigned`,
        shortMessage: `${fullName(created)} added`,
      })
      // The next free number moves on once this one is taken; a failed refresh just keeps the old suggestion.
      setSuggestedEmployeeNo(await api.suggestEmployeeNo().catch(() => ''))
    })

  const updateCrew = (crewId: string, input: CrewProfileInput) =>
    save(async () => {
      const updated = await getApi().updateCrew(crewId, input)
      patchCrew(crewId, () => updated)
      setNotice({
        message: 'Changes saved · licence, ratings and upcoming duties re-checked',
        shortMessage: 'Changes saved',
      })
    })

  const addCertification = (crewId: string, input: CertificationInput) =>
    save(async () => {
      const added = await getApi().addCertification(crewId, input)
      patchCrew(crewId, (member) => ({ ...member, certifications: [...member.certifications, added] }))
      setNotice({
        message: `${added.name} added · re-checked before each assignment`,
        shortMessage: `${added.name} added`,
      })
    })

  const updateCertification = (crewId: string, certificationId: string, input: CertificationInput) =>
    save(async () => {
      const updated = await getApi().updateCertification(crewId, certificationId, input)
      patchCrew(crewId, (member) => ({
        ...member,
        certifications: member.certifications.map((certification) => (certification.id === certificationId ? updated : certification)),
      }))
      setNotice({
        message: `${updated.name} updated · re-checked before each assignment`,
        shortMessage: `${updated.name} updated`,
      })
    })

  const removeCertification = (crewId: string, certificationId: string) =>
    save(async () => {
      const target = crew
        .find((member) => member.id === crewId)
        ?.certifications.find((certification) => certification.id === certificationId)
      await getApi().removeCertification(crewId, certificationId)
      patchCrew(crewId, (member) => ({
        ...member,
        certifications: member.certifications.filter((certification) => certification.id !== certificationId),
      }))
      setNotice({ message: `${target?.name ?? 'Certification'} removed`, shortMessage: 'Certification removed' })
    })

  return {
    crew,
    visibleCrew,
    metrics,
    filters,
    bases: options.bases,
    fleets: options.fleets,
    languages: options.languages,
    loadState,
    notice,
    expiryWarningDays,
    suggestedEmployeeNo,
    employeeNumbersInUse: (crewId) => crew.filter((member) => member.id !== crewId).map((member) => member.employeeNo),
    setSearch: (value) => setFilters((current) => ({ ...current, search: value })),
    setBase: (value) => setFilters((current) => ({ ...current, base: value as CrewFilters['base'] })),
    setRole: (value) => setFilters((current) => ({ ...current, role: value as CrewFilters['role'] })),
    clearFilters: () => setFilters(EMPTY_FILTERS),
    createCrew,
    updateCrew,
    addCertification,
    updateCertification,
    removeCertification,
    dismissNotice: () => setNotice(null),
  }
}
