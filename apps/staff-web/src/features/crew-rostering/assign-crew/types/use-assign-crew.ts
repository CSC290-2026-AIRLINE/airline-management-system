import { useCallback, useEffect, useMemo, useState } from 'react'
import { autoAssign, breaksByLeg, evaluateRules, summarise } from './crew-engine'
import { DEFAULT_PARAMS, MOCK_BASES, MOCK_CREW, MOCK_EXCLUDED_PAIRINGS, loadCommittedPairings } from './mock-data'
import type { AssignCrewParams, CommittedPairing, LegAssignment, LocalDate, RuleBreak, AssignmentSummary } from './types'

export type LoadState = 'idle' | 'loading' | 'error'

export interface AssignCrewState {
  params: AssignCrewParams
  bases: readonly string[]
  /** Every valid pairing Build pairings committed, in roster order. */
  pairings: CommittedPairing[]
  /** Pairings Build pairings did not hand over, for the footnote under the picker. */
  excluded: readonly { id: string; reason: 'invalid' | 'deleted' }[]
  selectedIds: string[]
  selectedPairings: CommittedPairing[]
  /** Flights across the selection, which is what the modal and the footer count. */
  selectedFlightCount: number
  loadState: LoadState
  /** `null` until auto-assign has run. A stale run is cleared rather than shown. */
  assignments: LegAssignment[] | null
  breaks: RuleBreak[]
  breaksByLeg: Map<string, RuleBreak[]>
  summary: AssignmentSummary | null
  /** `Date to must be on or after Date from.` when the range is inverted. */
  dateError: string | null
  setDateFrom: (value: string) => void
  setDateTo: (value: string) => void
  setBase: (value: string) => void
  togglePairing: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  runAutoAssign: () => void
}

/**
 * All assign-crew state in one place.
 *
 * This hook is the only module that knows data is mocked. `loadCommittedPairings` is
 * the single async call and `autoAssign` is the single decision, so replacing either
 * with a backend call is a change to this file and nothing else.
 *
 * Selection is stored as ids rather than as a set so the picker's checkbox state is
 * the same shape an API request would send back.
 */
export function useAssignCrew(): AssignCrewState {
  const [params, setParams] = useState<AssignCrewParams>(DEFAULT_PARAMS)
  const [pairings, setPairings] = useState<CommittedPairing[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Starts loading: the first committed-pairings request fires on mount, so the
  // loading state has to be true before the effect runs rather than set inside it.
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [assignments, setAssignments] = useState<LegAssignment[] | null>(null)

  const { dateFrom, dateTo } = params

  useEffect(() => {
    let cancelled = false
    loadCommittedPairings({ dateFrom, dateTo })
      .then((loaded) => {
        if (cancelled) return
        setPairings(loaded)
        // A fresh window starts with everything the backend handed over selected,
        // which is the state an operator can run immediately.
        setSelectedIds(loaded.map((pairing) => pairing.id))
        setAssignments(null)
        setLoadState('idle')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [dateFrom, dateTo])

  const selectedPairings = useMemo(() => pairings.filter((pairing) => selectedIds.includes(pairing.id)), [pairings, selectedIds])

  const selectedFlightCount = useMemo(() => selectedPairings.reduce((total, pairing) => total + pairing.legs.length, 0), [selectedPairings])

  const breaks = useMemo(() => (assignments ? evaluateRules(assignments) : []), [assignments])
  const breaksByLegMap = useMemo(() => (assignments ? breaksByLeg(assignments, breaks) : new Map()), [assignments, breaks])
  const summary = useMemo(() => (assignments ? summarise(assignments, breaks) : null), [assignments, breaks])

  const dateError =
    params.dateFrom !== '' && params.dateTo !== '' && params.dateTo < params.dateFrom ? 'Date to must be on or after Date from.' : null

  /** Any change to what would be crewed invalidates the previous run. */
  const editSelection = useCallback((next: (current: string[]) => string[]) => {
    setSelectedIds(next)
    setAssignments(null)
  }, [])

  const togglePairing = useCallback(
    (id: string) => editSelection((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id])),
    [editSelection],
  )

  const selectAll = useCallback(() => {
    setSelectedIds(pairings.map((pairing) => pairing.id))
    setAssignments(null)
  }, [pairings])

  const clearSelection = useCallback(() => editSelection(() => []), [editSelection])

  /**
   * Changing a date reloads the committed pairings, so the loading state is set here
   * rather than inside the effect. Setting it in the effect body would be a
   * synchronous setState on every render of the effect.
   */
  const setDateParam = useCallback((key: 'dateFrom' | 'dateTo', value: string) => {
    setLoadState('loading')
    setParams((current) => ({ ...current, [key]: value as LocalDate }))
  }, [])

  const runAutoAssign = useCallback(() => {
    if (selectedPairings.length === 0) return
    setAssignments(autoAssign(selectedPairings, MOCK_CREW))
  }, [selectedPairings])

  return {
    params,
    bases: MOCK_BASES,
    pairings,
    excluded: MOCK_EXCLUDED_PAIRINGS,
    selectedIds,
    selectedPairings,
    selectedFlightCount,
    loadState,
    assignments,
    breaks,
    breaksByLeg: breaksByLegMap,
    summary,
    dateError,
    setDateFrom: (value) => setDateParam('dateFrom', value),
    setDateTo: (value) => setDateParam('dateTo', value),
    setBase: (value) => setParams((current) => ({ ...current, base: value })),
    togglePairing,
    selectAll,
    clearSelection,
    runAutoAssign,
  }
}
