import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { useAppAuth } from '../../../../auth/AuthProvider'
import { parseWindowSearch } from '../../shared/window-search'
import { createAssignCrewApi } from './api'
import { DEFAULT_PARAMS } from './mock-data'
import { DEFAULT_RULE_LIMITS } from './roster-rules'
import type {
  AssignCrewParams,
  AssignmentSummary,
  LegCrew,
  LocalDate,
  RosterPairing,
  RosterRuleBreak,
  RosterRun,
  RuleLimits,
  RunResult,
} from './types'

export type LoadState = 'idle' | 'loading' | 'error'

export interface AssignCrewState {
  params: AssignCrewParams
  bases: readonly string[]
  /** The run Build pairings committed for exactly this base and window, or null if none yet. */
  rosterRun: RosterRun | null
  /** Every pairing in that run, in the order it was committed. */
  pairings: RosterPairing[]
  /** Pairings in the window Build pairings did not commit, for the footnote under the picker. */
  uncommitted: readonly { id: string; code: string }[]
  limits: RuleLimits
  selectedIds: string[]
  selectedPairings: RosterPairing[]
  /** Flights across the selection, which is what the modal and the footer count. */
  selectedFlightCount: number
  loadState: LoadState
  /** Why the last load failed, in the backend's words. */
  loadError: string | null
  isRunning: boolean
  /** Why the last auto-assign failed, in the backend's words. */
  runError: string | null
  /** `null` until the run has anyone assigned. */
  assignments: LegCrew[] | null
  breaks: RosterRuleBreak[]
  /** Open breaks keyed by `pairing_leg.id`. */
  breaksByLeg: Map<string, RosterRuleBreak[]>
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
 * Reads the run Build pairings committed for the chosen window from
 * `/api/crew-rostering/assign-crew` and runs auto-assign there once the operator has chosen pairings. The backend crews, checks every rule and stores the result, so
 * this hook only keeps the latest answer.
 *
 * Selection is stored as ids, the same shape the auto-assign request sends.
 */
export function useAssignCrew(): AssignCrewState {
  const { accessToken, isLoading: authLoading, fetchWithAuth } = useAppAuth()
  // `fetchWithAuth` is a new function on every provider render. Reading it through a ref
  // keeps `getApi` stable, so the load effect runs when the window changes, not on every render.
  const fetchRef = useRef(fetchWithAuth)
  useEffect(() => {
    fetchRef.current = fetchWithAuth
  }, [fetchWithAuth])
  const getApi = useCallback(() => createAssignCrewApi(fetchRef.current), [])
  const signedIn = accessToken !== null

  const search = useSearch({ strict: false }) as Record<string, unknown>
  const [params, setParams] = useState<AssignCrewParams>(() => ({ ...DEFAULT_PARAMS, ...parseWindowSearch(search) }))
  const [bases, setBases] = useState<readonly string[]>(() => [params.base])
  const [rosterRun, setRosterRun] = useState<RosterRun | null>(null)
  const [pairings, setPairings] = useState<RosterPairing[]>([])
  const [uncommitted, setUncommitted] = useState<{ id: string; code: string }[]>([])
  const [limits, setLimits] = useState<RuleLimits>(DEFAULT_RULE_LIMITS)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Starts loading: the first committed-pairings request fires as soon as the session is ready.
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)

  const { dateFrom, dateTo, base } = params

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    getApi()
      .listBases()
      .then((loaded) => {
        if (!cancelled && loaded.length > 0) setBases(loaded)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [getApi, signedIn])

  useEffect(() => {
    if (!signedIn || dateFrom === '' || dateTo === '' || dateTo < dateFrom) return
    let cancelled = false
    getApi()
      .listPairings({ dateFrom, dateTo, base })
      .then((loaded) => {
        if (cancelled) return
        setRosterRun(loaded.rosterRun)
        setPairings(loaded.pairings)
        setUncommitted(loaded.uncommitted)
        setLimits(loaded.limits)
        // Nothing is chosen and nothing is shown as run yet: the operator picks the pairings and
        // presses Run auto-assign themselves. Crew an earlier run stored stays in the backend and
        // is replaced when they run it, so it is not read back here.
        setSelectedIds([])
        setResult(null)
        setLoadState('idle')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : 'Could not load the committed pairings.')
        setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [getApi, signedIn, dateFrom, dateTo, base])

  const selectedPairings = useMemo(() => pairings.filter((pairing) => selectedIds.includes(pairing.id)), [pairings, selectedIds])

  const selectedFlightCount = useMemo(() => selectedPairings.reduce((total, pairing) => total + pairing.legs.length, 0), [selectedPairings])

  const breaks = useMemo(() => result?.breaks ?? [], [result])
  const breaksByLeg = useMemo(() => {
    const byLeg = new Map<string, RosterRuleBreak[]>()
    for (const item of breaks) byLeg.set(item.legId, [...(byLeg.get(item.legId) ?? []), item])
    return byLeg
  }, [breaks])

  const dateError =
    params.dateFrom !== '' && params.dateTo !== '' && params.dateTo < params.dateFrom ? 'Date to must be on or after Date from.' : null

  const togglePairing = useCallback(
    (id: string) => setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id])),
    [],
  )

  const selectAll = useCallback(() => setSelectedIds(pairings.map((pairing) => pairing.id)), [pairings])

  const clearSelection = useCallback(() => setSelectedIds([]), [])

  /** Changing the window reloads it, so the loading state is set here rather than inside the effect. */
  const setParam = useCallback((key: keyof AssignCrewParams, value: string) => {
    setLoadState('loading')
    setLoadError(null)
    setRunError(null)
    setParams((current) => ({ ...current, [key]: key === 'base' ? value : (value as LocalDate) }))
  }, [])

  const runAutoAssign = useCallback(() => {
    if (!rosterRun || selectedIds.length === 0 || isRunning) return
    setIsRunning(true)
    setRunError(null)
    getApi()
      .autoAssign(rosterRun.id, selectedIds)
      .then((run) => {
        setResult(run)
        setRosterRun(run.rosterRun)
      })
      .catch((error: unknown) => setRunError(error instanceof Error ? error.message : 'Auto-assign failed. Try again.'))
      .finally(() => setIsRunning(false))
  }, [getApi, isRunning, rosterRun, selectedIds])

  return {
    params,
    bases,
    rosterRun,
    pairings,
    uncommitted,
    limits,
    selectedIds,
    selectedPairings,
    selectedFlightCount,
    // Without a token the load effect never runs, so say why instead of loading forever.
    loadState: signedIn ? loadState : authLoading ? 'loading' : 'error',
    loadError: signedIn ? loadError : authLoading ? null : NOT_SIGNED_IN,
    isRunning,
    runError,
    assignments: result?.assignments ?? null,
    breaks,
    breaksByLeg,
    summary: result?.summary ?? null,
    dateError,
    setDateFrom: (value) => setParam('dateFrom', value),
    setDateTo: (value) => setParam('dateTo', value),
    setBase: (value) => setParam('base', value),
    togglePairing,
    selectAll,
    clearSelection,
    runAutoAssign,
  }
}

const NOT_SIGNED_IN = 'Could not sign in to the API. Sign out, sign in again, and check that the backend is running on port 8080.'
