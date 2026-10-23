import { useCallback, useEffect, useMemo, useState } from 'react'
import { MOCK_BASES, MOCK_FLEETS, MOCK_LANGUAGES, loadCrew, nextEmployeeNo } from './mock-data'
import { toCertification } from './crew-form'
import { fullName } from './format'
import type { CertificationInput, CrewFilters, CrewMember, CrewMetrics, CrewProfileInput, PageNotice } from './types'
import { PILOT_ROLES } from './types'

export type LoadState = 'idle' | 'loading' | 'error'

const EMPTY_FILTERS: CrewFilters = { search: '', base: 'all', role: 'all' }

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
  /** Employee number the create modal pre-fills, e.g. `EMP-2202`. */
  suggestedEmployeeNo: string
  /** Employee numbers not owned by `crewId`, for the edit form's uniqueness check. */
  employeeNumbersInUse: (crewId: string | null) => string[]
  setSearch: (value: string) => void
  setBase: (value: string) => void
  setRole: (value: string) => void
  clearFilters: () => void
  createCrew: (input: CrewProfileInput) => CrewMember
  updateCrew: (crewId: string, input: CrewProfileInput) => void
  addCertification: (crewId: string, input: CertificationInput) => void
  updateCertification: (crewId: string, certificationId: string, input: CertificationInput) => void
  removeCertification: (crewId: string, certificationId: string) => void
  dismissNotice: () => void
}

/**
 * All setup-crew state in one place.
 *
 * `loadCrew` is the single async call and the only thing that knows the data is
 * mocked. Swapping it for TanStack Query later touches this file alone: every
 * component reads plain values from here and never imports `mock-data`.
 *
 * Filters are held here rather than in the table because the metric cards count
 * the whole roster, not the visible rows — keeping both in one place makes that
 * difference obvious.
 */
export function useSetupCrew(): SetupCrewState {
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [filters, setFilters] = useState<CrewFilters>(EMPTY_FILTERS)
  // The first fetch starts as soon as the hook mounts, so the initial state is
  // already `loading`. Setting it from the effect body would be a second render
  // for no reason, and React's own lint rule rejects it.
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [notice, setNotice] = useState<PageNotice | null>(null)

  useEffect(() => {
    let active = true
    loadCrew()
      .then((loaded) => {
        if (!active) return
        setCrew(loaded)
        setLoadState('idle')
      })
      .catch(() => {
        if (active) setLoadState('error')
      })
    return () => {
      active = false
    }
  }, [])

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

  const createCrew = useCallback((input: CrewProfileInput) => {
    // Not a real id: a backend assigns these. Unique because the list is short
    // and one profile at a time is created per session.
    const created: CrewMember = {
      id: `CRW-LOCAL-${Date.now()}`,
      ...input,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      employeeNo: input.employeeNo.trim(),
      licenceNumber: input.licenceNumber.trim(),
      hours28d: 0,
      hoursCap: 100,
      certifications: [],
      upcomingDuties: [],
      justCreated: true,
    }
    setCrew((current) => [created, ...current])
    setNotice({
      message: `Crew profile created · ${fullName(created)} (${created.employeeNo}) can now be auto-assigned`,
      shortMessage: `${fullName(created)} added`,
    })
    return created
  }, [])

  const updateCrew = useCallback((crewId: string, input: CrewProfileInput) => {
    patchCrew(crewId, (member) => ({
      ...member,
      ...input,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      employeeNo: input.employeeNo.trim(),
      licenceNumber: input.licenceNumber.trim(),
    }))
    setNotice({
      message: 'Changes saved · licence, ratings and upcoming duties re-checked',
      shortMessage: 'Changes saved',
    })
  }, [])

  const addCertification = useCallback((crewId: string, input: CertificationInput) => {
    patchCrew(crewId, (member) => ({
      ...member,
      certifications: [...member.certifications, toCertification(member.id, input, member.certifications)],
    }))
    setNotice({
      message: `${input.name.trim()} added · re-checked before each assignment`,
      shortMessage: `${input.name.trim()} added`,
    })
  }, [])

  const updateCertification = useCallback((crewId: string, certificationId: string, input: CertificationInput) => {
    patchCrew(crewId, (member) => ({
      ...member,
      certifications: member.certifications.map((certification) =>
        certification.id === certificationId
          ? { ...certification, name: input.name.trim(), aircraftType: input.aircraftType, expiresOn: input.expiresOn }
          : certification,
      ),
    }))
    setNotice({
      message: `${input.name.trim()} updated · re-checked before each assignment`,
      shortMessage: `${input.name.trim()} updated`,
    })
  }, [])

  const removeCertification = useCallback(
    (crewId: string, certificationId: string) => {
      const target = crew
        .find((member) => member.id === crewId)
        ?.certifications.find((certification) => certification.id === certificationId)
      patchCrew(crewId, (member) => ({
        ...member,
        certifications: member.certifications.filter((certification) => certification.id !== certificationId),
      }))
      setNotice({ message: `${target?.name ?? 'Certification'} removed`, shortMessage: 'Certification removed' })
    },
    [crew],
  )

  return {
    crew,
    visibleCrew,
    metrics,
    filters,
    bases: MOCK_BASES,
    fleets: MOCK_FLEETS,
    languages: MOCK_LANGUAGES,
    loadState,
    notice,
    suggestedEmployeeNo: nextEmployeeNo(crew),
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
