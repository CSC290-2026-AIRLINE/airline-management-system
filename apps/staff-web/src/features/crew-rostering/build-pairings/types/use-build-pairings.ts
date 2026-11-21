import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { useAppAuth } from '../../../../auth/AuthProvider'
import { parseWindowSearch } from '../../shared/window-search'
import { useWindowInUrl } from '../../shared/use-window-in-url'
import { createBuildPairingsApi, type CommittedPairing, type GenerateResult } from './api'
import { DEFAULT_PARAMS } from './mock-data'
import { todayAndTomorrow } from './format'
import { validatePairing } from './pairing-engine'
import type { BuildPairingParams, FlightLeg, LocalDate, Pairing, PairingMetrics, RosterRun, ScheduledFlight } from './types'

/** Transient page-level feedback, rendered as a banner or a toast. */
export interface PageNotice {
  tone: 'success' | 'warning'
  message: string
  /** `toast` floats and clears itself; `banner` (the default) sits under the wizard until the next action. */
  variant?: 'toast' | 'banner'
  /** A shorter sentence for phones. When present, a banner becomes a toast below `sm`. */
  shortMessage?: string
}

export type LoadState = 'idle' | 'loading' | 'error'

export interface BuildPairingsState {
  params: BuildPairingParams
  bases: readonly string[]
  flights: ScheduledFlight[]
  pairings: Pairing[]
  /** The run for exactly this base and window, once something has been committed to it. */
  rosterRun: RosterRun | null
  /** The run the API has for these dates and base (or null), independent of what is on screen. */
  windowRun: RosterRun | null
  selectedId: string | null
  loadState: LoadState
  /** Why the last load or generate failed, in the backend's words. */
  loadError: string | null
  /** True while a save, delete, clear or commit is in flight. */
  isSaving: boolean
  notice: PageNotice | null
  /** `Date to must be on or after Date from.` when the range is inverted. */
  dateError: string | null
  hasGenerated: boolean
  metrics: PairingMetrics
  setDateFrom: (value: string) => void
  setDateTo: (value: string) => void
  setBase: (value: string) => void
  generate: () => void
  clearPairings: () => void
  select: (id: string | null) => void
  saveLegs: (id: string, legs: FlightLeg[]) => void
  deletePairing: (id: string) => void
  /** Where Continue to Assign crew should open: the window of a run that already holds committed pairings, or null. */
  continueWindow: BuildPairingParams | null
  /** Commits the valid pairings, then calls `onCommitted` if the run now holds any. */
  commit: (onCommitted: () => void) => void
  dismissNotice: () => void
}

/**
 * All build-pairings state in one place.
 *
 * The flow is propose, adjust, commit. Generate asks the server for a proposal
 * (`/api/crew-rostering/build-pairing`) and nothing about it is stored. Edit legs and Delete change
 * the proposal here, in the page. Commit is the one call that writes: it sends the valid pairings,
 * the server checks them again, stores them and gives them to this window's roster run, and
 * Assign crew then opens on exactly those. Clear and changing the window just drop the proposal.
 *
 * Validity is recomputed here on every render, with the limits the server attached to each
 * pairing, so a badge and its check list can never disagree. The server's check at commit is
 * the one that counts; anything it rejects is reported by code.
 */
export function useBuildPairings(): BuildPairingsState {
  const { accessToken, isLoading: authLoading, fetchWithAuth } = useAppAuth()
  // `fetchWithAuth` is a new function on every provider render. Reading it through a ref
  // keeps `getApi` stable, so the load effect runs when the window changes, not on every render.
  const fetchRef = useRef(fetchWithAuth)
  useEffect(() => {
    fetchRef.current = fetchWithAuth
  }, [fetchWithAuth])
  const getApi = useCallback(() => createBuildPairingsApi(fetchRef.current), [])
  const signedIn = accessToken !== null

  const search = useSearch({ strict: false }) as Record<string, unknown>
  const [params, setParams] = useState<BuildPairingParams>(() => ({
    ...DEFAULT_PARAMS,
    ...todayAndTomorrow(),
    ...parseWindowSearch(search),
  }))
  const [bases, setBases] = useState<readonly string[]>(() => [params.base])
  useWindowInUrl(params)
  const [flights, setFlights] = useState<ScheduledFlight[]>([])
  const [pairings, setPairings] = useState<Pairing[]>([])
  const [rosterRun, setRosterRun] = useState<RosterRun | null>(null)
  // The run the API holds for the chosen dates and base, whatever is on screen: the badge reads this, so it still says
  // Published after Clear and before Generate, instead of guessing from the pairings showing.
  const [windowRun, setWindowRun] = useState<RosterRun | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The page opens empty until the window's committed pairings load or the operator presses Generate pairings.
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<PageNotice | null>(null)
  const [hasGenerated, setHasGenerated] = useState(false)
  /** What was already committed in this window when it was generated, with the run each belongs to. */
  const [committed, setCommitted] = useState<CommittedPairing[]>([])

  const dateError = isRangeInverted(params) ? 'Date to must be on or after Date from.' : null

  const apply = useCallback((list: GenerateResult, base: string) => {
    setPairings(list.pairings)
    setFlights(list.flights)
    setRosterRun(list.rosterRun)
    setWindowRun(runWithPairings(list, base))
    setCommitted(list.committed)
    setHasGenerated(list.pairings.length > 0)
    setLoadState('idle')
  }, [])

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

  // The page opens on today and tomorrow by the simulation clock. The browser's date is only the first guess, used until the
  // clock answers; a window that came from the URL, or that the operator already changed, is left alone.
  const keepDates = useRef(parseWindowSearch(search).dateFrom !== undefined || parseWindowSearch(search).dateTo !== undefined)
  useEffect(() => {
    if (!signedIn || keepDates.current) return
    let cancelled = false
    getApi()
      .getClock()
      .then((now) => {
        if (!cancelled && !keepDates.current) setParams((current) => ({ ...current, ...todayAndTomorrow(now) }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [getApi, signedIn])

  // Which run the chosen window already has. Pairings already committed to it are shown straight away (locked), so coming back
  // from the sidebar or a reload finds the run and can continue to Assign crew; new proposals still wait for Generate pairings.
  // A proposal already on screen is never replaced by this answer arriving late.
  const proposalShown = useRef(false)
  const { dateFrom, dateTo, base } = params
  useEffect(() => {
    if (!signedIn || isRangeInverted({ dateFrom, dateTo, base })) return
    let cancelled = false
    getApi()
      .listPairings({ dateFrom, dateTo, base })
      .then((list) => {
        if (cancelled) return
        // Opened without dates (from the sidebar), today's window can catch only part of a draft run in progress, such as a
        // 20–21 Nov run seen from 21–22 Nov. Open the run on its own dates instead, so this page lists all of its pairings,
        // the same ones Assign crew crews. Dates from the URL or chosen by the operator are never moved.
        const run = runWithPairings(list, base)
        if (
          !keepDates.current &&
          !proposalShown.current &&
          run?.status === 'draft' &&
          (run.dateFrom !== dateFrom || run.dateTo !== dateTo)
        ) {
          keepDates.current = true
          setParams((current) => ({ ...current, dateFrom: run.dateFrom, dateTo: run.dateTo }))
          return
        }
        if (list.committed.length > 0 && !proposalShown.current) apply(list, base)
        else setWindowRun(run)
      })
      .catch(() => {
        if (!cancelled) setWindowRun(null)
      })
    return () => {
      cancelled = true
    }
  }, [getApi, signedIn, dateFrom, dateTo, base, apply])

  /** Runs a write, shows its failure as a notice, and keeps the page usable either way. */
  const mutate = useCallback(async (write: () => Promise<void>) => {
    setIsSaving(true)
    try {
      await write()
    } catch (error) {
      setNotice({ tone: 'warning', message: errorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }, [])

  const generate = useCallback(() => {
    if (isRangeInverted(params)) return
    setLoadState('loading')
    setLoadError(null)
    setNotice(null)
    setSelectedId(null)
    proposalShown.current = true
    getApi()
      .generate(params)
      .then((list) => {
        apply(list, params.base)
        setHasGenerated(true)
        const proposed = list.pairings.filter((pairing) => pairing.rosterRunId == null).length
        const elsewhere = list.committed.some((row) => row.runDateFrom !== params.dateFrom || row.runDateTo !== params.dateTo)
        if (proposed === 0) {
          setNotice({
            tone: 'warning',
            message: `No unpaired flights found for ${params.base} between ${params.dateFrom} and ${params.dateTo}.${describeCommitted(list.committed)} Check the flight schedule for that window.`,
          })
        } else if (elsewhere) {
          // The committed ones are listed below, but they belong to a run for another window.
          setNotice({ tone: 'warning', message: describeCommitted(list.committed).trim() })
        }
      })
      .catch((error: unknown) => {
        setLoadError(errorMessage(error))
        setLoadState('error')
      })
  }, [getApi, apply, params])

  /** Back to the empty state, ready for a fresh Generate pairings. Proposals are never stored, so there is nothing to delete. */
  const clearPairings = useCallback(() => {
    setPairings([])
    setFlights([])
    setCommitted([])
    setHasGenerated(false)
    setSelectedId(null)
    setNotice(null)
    setLoadError(null)
    setLoadState('idle')
  }, [])

  /**
   * Applies an edit to a proposal. Proposals live in the page until they are committed, so this
   * only recomputes the pairing: the page's own legality check gives the answer, and the server
   * checks again when the pairing is committed.
   */
  const saveLegs = useCallback(
    (id: string, legs: FlightLeg[]) => {
      const before = pairings.find((pairing) => pairing.id === id)
      // A committed pairing is part of a roster run and is not edited here.
      if (!before || before.rosterRunId != null) return
      // A pairing's order is its departure order, here as in the database.
      const saved: Pairing = { ...before, legs: [...legs].sort((a, b) => a.departureAt.localeCompare(b.departureAt)) }
      const kept = new Set(saved.legs.map((leg) => leg.flightId))
      setPairings((current) => current.map((pairing) => (pairing.id === id ? saved : pairing)))
      setFlights((current) =>
        current.map((flight) =>
          kept.has(flight.id)
            ? { ...flight, status: 'paired', pairingId: id }
            : flight.pairingId === id
              ? { ...flight, status: 'available', pairingId: null }
              : flight,
        ),
      )

      const wasBefore = validatePairing(before).status
      const now = validatePairing(saved).status
      const added = saved.legs.filter((leg) => !before.legs.some((existing) => existing.flightId === leg.flightId))

      if (added.length > 0) {
        const changed = wasBefore === now ? 'still' : 'now'
        const state = now === 'passed' ? 'valid' : 'invalid'
        setNotice({
          tone: 'success',
          variant: 'banner',
          message: `Legs saved · ${added.map((leg) => `${leg.flightNumber} ${leg.origin} → ${leg.destination}`).join(', ')} added. ${saved.code} re-checked: ${changed} ${state}.`,
          shortMessage: `Legs saved · ${added.map((leg) => leg.flightNumber).join(', ')} added. ${saved.code} is ${changed} ${now === 'passed' ? 'Valid' : 'Invalid'}`,
        })
        return
      }

      setNotice({
        tone: 'success',
        variant: 'toast',
        message: `${saved.code} saved · re-checked: ${describeOutcome(saved)}`,
        shortMessage: `${saved.code} saved · re-checked: ${wasBefore === now ? 'still ' : ''}${now === 'passed' ? 'Valid' : 'Invalid'}`,
      })
    },
    [pairings],
  )

  /** Drops a proposal; its flights go back to the unpaired list. Nothing was stored, so nothing is deleted anywhere. */
  const deletePairing = useCallback(
    (id: string) => {
      const target = pairings.find((pairing) => pairing.id === id)
      if (!target || target.deleted || target.rosterRunId != null) return
      const releasedFlightIds = target.legs.map((leg) => leg.flightId)
      const numbers = target.legs.map((leg) => leg.flightNumber)
      const freed = new Set(releasedFlightIds)
      setPairings((current) =>
        current.map((pairing) =>
          pairing.id === id ? { ...pairing, legs: [], deleted: true, releasedFlightIds, releasedFlightNumbers: numbers } : pairing,
        ),
      )
      setFlights((current) =>
        current.map((flight) => (freed.has(flight.id) ? { ...flight, status: 'available', pairingId: null } : flight)),
      )
      setSelectedId(null)
      setNotice({
        tone: 'warning',
        variant: 'banner',
        message: `${target.code} deleted · ${numbers.join(' and ')} ${numbers.length === 1 ? 'is' : 'are'} back in the unpaired list. Generate pairings again to rebuild ${numbers.length === 1 ? 'it' : 'them'}.`,
        shortMessage: `${target.code} deleted · ${numbers.join(', ')} back in the unpaired list`,
      })
    },
    [pairings],
  )

  /**
   * The step where pairings become data: sends the valid proposals to the server, which checks them
   * again, stores them and hands them to this window's roster run. Assign crew then opens on exactly them.
   */
  const commit = useCallback(
    (onCommitted: () => void) => {
      const drafts = pairings.filter(
        (pairing) => !pairing.deleted && pairing.rosterRunId == null && validatePairing(pairing).status === 'passed',
      )
      if (drafts.length === 0) {
        setNotice({ tone: 'warning', message: 'No valid pairing to commit. Fix the invalid ones in Edit legs, or generate again.' })
        return
      }
      void mutate(async () => {
        const result = await getApi().commit(
          params,
          drafts.map((pairing) => ({
            ref: pairing.code,
            legs: pairing.legs.map((leg) => ({ flightId: leg.flightId, addedManually: leg.addedManually })),
          })),
        )
        setRosterRun(result.rosterRun)
        setWindowRun(result.rosterRun)
        const stored = new Map(result.committed.map((row) => [row.ref, row.code]))
        setPairings((current) =>
          current.map((pairing) =>
            !pairing.deleted && pairing.rosterRunId == null && stored.has(pairing.code)
              ? { ...pairing, code: stored.get(pairing.code) ?? pairing.code, rosterRunId: result.rosterRun.id, rosterRunStatus: 'draft' }
              : pairing,
          ),
        )

        const skipped = [
          result.skippedInvalid.length > 0 ? `${result.skippedInvalid.join(', ')} failed the server's legality check` : '',
          result.skippedOutsideWindow.length > 0
            ? `${result.skippedOutsideWindow.join(', ')} left out for running past ${params.dateTo}`
            : '',
          result.skippedTaken.length > 0 ? `${result.skippedTaken.join(', ')} left out: a flight is already in another pairing` : '',
        ].filter(Boolean)
        const skippedText = skipped.length > 0 ? ` ${skipped.join('; ')}.` : ''

        if (result.committed.length === 0) {
          setNotice({ tone: 'warning', message: `Nothing was committed.${skippedText}` })
          return
        }
        setNotice({
          tone: skipped.length > 0 ? 'warning' : 'success',
          message: `${result.committed.map((row) => row.code).join(', ')} committed to the draft roster run.${skippedText}`,
        })
        onCommitted()
      })
    },
    [getApi, mutate, pairings, params],
  )

  const metrics = useMemo<PairingMetrics>(() => {
    let validCount = 0
    let invalidCount = 0
    let deletedCount = 0
    let committedCount = 0
    let totalFlights = 0

    for (const pairing of pairings) {
      if (pairing.deleted) {
        deletedCount += 1
        continue
      }
      totalFlights += pairing.legs.length
      if (pairing.rosterRunId != null) {
        committedCount += 1
        continue
      }
      if (validatePairing(pairing).status === 'passed') validCount += 1
      else invalidCount += 1
    }

    return { totalPairings: pairings.length, totalFlights, validCount, invalidCount, deletedCount, committedCount }
  }, [pairings])

  /** Changing the window empties the view; its committed pairings come back from the load effect, new ones need Generate pairings. */
  const setParam = useCallback((key: keyof BuildPairingParams, value: string) => {
    proposalShown.current = false
    setPairings([])
    setFlights([])
    setCommitted([])
    setHasGenerated(false)
    setLoadState('idle')
    setLoadError(null)
    setSelectedId(null)
    setNotice(null)
    setParams((current) => ({ ...current, [key]: key === 'base' ? value : (value as LocalDate) }))
  }, [])

  const dismissNotice = useCallback(() => setNotice(null), [])

  // Opens the run that already holds committed pairings: this window's if it has some, otherwise the one they were committed to.
  // Only a draft run can still be crewed. Once it is published there is nothing to continue to, and Assign crew would only refuse.
  const continueWindow = useMemo<BuildPairingParams | null>(() => {
    if (rosterRun?.status === 'draft' && pairings.some((pairing) => !pairing.deleted && pairing.rosterRunId === rosterRun.id)) return params
    const other = committed.find((row) => row.runStatus === 'draft')
    return other ? { dateFrom: other.runDateFrom, dateTo: other.runDateTo, base: params.base } : null
  }, [committed, pairings, params, rosterRun])

  return {
    params,
    bases,
    flights,
    pairings,
    rosterRun,
    windowRun,
    selectedId,
    // Without a token the load effect never runs, so say why instead of loading forever.
    loadState: signedIn ? loadState : authLoading ? 'loading' : 'error',
    loadError: signedIn ? loadError : authLoading ? null : NOT_SIGNED_IN,
    isSaving,
    notice,
    dateError,
    hasGenerated,
    metrics,
    continueWindow,
    setDateFrom: (value) => {
      keepDates.current = true
      setParam('dateFrom', value)
    },
    setDateTo: (value) => {
      keepDates.current = true
      setParam('dateTo', value)
    },
    setBase: (value) => setParam('base', value),
    generate,
    clearPairings,
    select: setSelectedId,
    saveLegs,
    deletePairing,
    commit,
    dismissNotice,
  }
}

const NOT_SIGNED_IN = 'Could not sign in to the API. Sign out, sign in again, and check that the backend is running on port 8080.'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

function isRangeInverted(params: BuildPairingParams): boolean {
  return params.dateFrom !== '' && params.dateTo !== '' && params.dateTo < params.dateFrom
}

function describeOutcome(pairing: Pairing): string {
  const evaluation = validatePairing(pairing)
  const valueOf = (code: string) => evaluation.checks.find((check) => check.code === code)?.value
  return evaluation.status === 'passed'
    ? `Valid (${valueOf('PAIRING_TOO_LONG')}, max ${valueOf('DUTY_DAY_EXCEEDED')} duty a day)`
    : `Invalid (${evaluation.primaryError?.detail ?? 'does not meet pairing rules'})`
}

/** `P-101, P-102 are already committed to the roster run for 2026-09-15 to 2026-09-19. Their flights are not offered again…` */
function describeCommitted(committed: readonly CommittedPairing[]): string {
  if (committed.length === 0) return ''
  const windows = new Map<string, string[]>()
  for (const row of committed) {
    const key = `${row.runDateFrom} to ${row.runDateTo}`
    windows.set(key, [...(windows.get(key) ?? []), row.code])
  }
  const parts = [...windows].map(
    ([window, codes]) => `${codes.join(', ')} ${codes.length === 1 ? 'is' : 'are'} already committed to the roster run for ${window}`,
  )
  return ` ${parts.join('; ')}. ${committed.length === 1 ? 'Its flights are' : 'Their flights are'} not offered again; use Continue to Assign crew to open that run.`
}

/**
 * The roster run that holds committed pairings in the window, whatever dates that run has: pairings committed for 15-19 Sep
 * are in play for a 9-16 Sep window too. A draft run comes first (it is the one still to crew), then the others. Null when
 * nothing in the window is committed, which is the only time the badge says Not committed.
 */
function runWithPairings(list: { committed: readonly CommittedPairing[] }, base: string): RosterRun | null {
  const row = list.committed.find((item) => item.runStatus === 'draft') ?? list.committed[0]
  return row ? { id: row.rosterRunId, base, dateFrom: row.runDateFrom, dateTo: row.runDateTo, status: row.runStatus } : null
}
