import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { useAppAuth } from '../../../../auth/AuthProvider'
import { parseWindowSearch } from '../../shared/window-search'
import { createBuildPairingsApi, type CommittedPairing, type GenerateResult } from './api'
import { DEFAULT_PARAMS } from './mock-data'
import { validatePairing } from './pairing-engine'
import type { BuildPairingParams, FlightLeg, LocalDate, Pairing, PairingMetrics, RosterRun, ScheduledFlight } from './types'

/** A pairing is a row in the database once it is committed to a run, or when it is a draft carried over from an earlier round. */
function isStored(pairing: Pairing): boolean {
  return pairing.rosterRunId != null || !pairing.id.startsWith('draft-')
}

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
 * The flow is propose, adjust, commit. Generate asks the server for a random proposal
 * (`/api/crew-rostering/build-pairing`) and nothing about it is stored. Edit legs and Delete on a proposal
 * change it here, in the page. Commit is the call that stores proposals: it sends the valid pairings, the
 * server checks them again, stores them and gives them to this window's roster run, and Assign crew then
 * opens on exactly those. Once a pairing is committed to a draft run it is a database row: Edit legs and
 * Delete on it are written to the database. Clear and changing the window just drop the proposal.
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
  const [params, setParams] = useState<BuildPairingParams>(() => ({ ...DEFAULT_PARAMS, ...parseWindowSearch(search) }))
  const [bases, setBases] = useState<readonly string[]>(() => [params.base])
  const [flights, setFlights] = useState<ScheduledFlight[]>([])
  const [pairings, setPairings] = useState<Pairing[]>([])
  const [rosterRun, setRosterRun] = useState<RosterRun | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The page opens empty: nothing is shown until the operator presses Generate pairings.
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<PageNotice | null>(null)
  const [hasGenerated, setHasGenerated] = useState(false)
  /** What was already committed in this window when it was generated, with the run each belongs to. */
  const [committed, setCommitted] = useState<CommittedPairing[]>([])

  const dateError = isRangeInverted(params) ? 'Date to must be on or after Date from.' : null

  const apply = useCallback((list: GenerateResult) => {
    setPairings(list.pairings)
    setFlights(list.flights)
    setRosterRun(list.rosterRun)
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
    getApi()
      .generate(params)
      .then((list) => {
        apply(list)
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

  /** Takes a pairing off the page and puts its flights back in the unpaired list. */
  const removePairing = useCallback((id: string, releasedFlightIds: readonly string[]) => {
    const freed = new Set(releasedFlightIds)
    setPairings((current) => current.filter((pairing) => pairing.id !== id))
    setFlights((current) => current.map((flight) => (freed.has(flight.id) ? { ...flight, status: 'available', pairingId: null } : flight)))
    setSelectedId(null)
  }, [])

  /** Shows an edited pairing on the page and says how the re-check came out. Validity is derived from the legs, never stored. */
  const applyLegs = useCallback((before: Pairing, saved: Pairing) => {
    const kept = new Set(saved.legs.map((leg) => leg.flightId))
    setPairings((current) => current.map((pairing) => (pairing.id === saved.id ? saved : pairing)))
    setFlights((current) =>
      current.map((flight) =>
        kept.has(flight.id)
          ? { ...flight, status: 'paired', pairingId: saved.id }
          : flight.pairingId === saved.id
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
  }, [])

  /**
   * Deletes a pairing. A proposal was never stored, so it just leaves the page. A pairing committed to a draft run is a
   * row in the database: the server deletes it and its flights go back to the unpaired list. One in a published roster is
   * refused. Either way the pairing is gone from the page, not left behind as a placeholder.
   */
  const deletePairing = useCallback(
    (id: string) => {
      const target = pairings.find((pairing) => pairing.id === id)
      if (!target || target.deleted) return
      const numbers = target.legs.map((leg) => leg.flightNumber)
      const listed = numbers.length > 0 ? `${numbers.join(' and ')} ${numbers.length === 1 ? 'is' : 'are'} back in the unpaired list.` : ''

      if (!isStored(target)) {
        removePairing(
          id,
          target.legs.map((leg) => leg.flightId),
        )
        setNotice({
          tone: 'warning',
          variant: 'banner',
          message: `${target.code} deleted. ${listed}`.trim(),
          shortMessage: `${target.code} deleted${numbers.length > 0 ? ` · ${numbers.join(', ')} back in the unpaired list` : ''}`,
        })
        return
      }
      if (target.rosterRunStatus === 'published') {
        setNotice({ tone: 'warning', message: `${target.code} is in a published roster. Change its crew in Fix & publish instead.` })
        return
      }
      void mutate(async () => {
        const result = await getApi().deletePairing(id)
        removePairing(id, result.releasedFlightIds)
        setCommitted((current) => current.filter((row) => row.code !== target.code))
        setNotice({
          tone: 'warning',
          variant: 'banner',
          message: `${target.code} deleted from the draft roster run and the database. ${listed}`.trim(),
          shortMessage: `${target.code} deleted${numbers.length > 0 ? ` · ${numbers.join(', ')} back in the unpaired list` : ''}`,
        })
      })
    },
    [getApi, mutate, pairings, removePairing],
  )

  /**
   * Edits a pairing's legs. A proposal is only on this page until it is committed, so its edit stays here. A pairing
   * already committed to a draft run is stored, so its edit is written to the database and the page shows what the
   * server kept. One in a published roster is changed in Fix & publish. Taking every leg off deletes the pairing.
   */
  const saveLegs = useCallback(
    (id: string, legs: FlightLeg[]) => {
      const before = pairings.find((pairing) => pairing.id === id)
      if (!before || before.deleted) return
      if (legs.length === 0) {
        deletePairing(id)
        return
      }
      // A pairing's order is its departure order, here as in the database.
      const sorted = [...legs].sort((a, b) => a.departureAt.localeCompare(b.departureAt))

      if (!isStored(before)) {
        applyLegs(before, { ...before, legs: sorted })
        return
      }
      if (before.rosterRunStatus === 'published') {
        setNotice({ tone: 'warning', message: `${before.code} is in a published roster. Change its crew in Fix & publish instead.` })
        return
      }
      void mutate(async () => {
        const result = await getApi().saveLegs(id, sorted)
        applyLegs(before, { ...before, legs: result.pairing.legs, limits: result.pairing.limits ?? before.limits })
      })
    },
    [applyLegs, deletePairing, getApi, mutate, pairings],
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
        const stored = new Map(result.committed.map((row) => [row.ref, row]))
        setPairings((current) =>
          current.map((pairing) => {
            const row = !pairing.deleted && pairing.rosterRunId == null ? stored.get(pairing.code) : undefined
            // The committed copy has its own id in the database, so the page switches to it.
            return row ? { ...pairing, id: row.id, code: row.code, rosterRunId: result.rosterRun.id, rosterRunStatus: 'draft' } : pairing
          }),
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

  /** Changing the window empties the view; the new window is only loaded when Generate pairings is pressed. */
  const setParam = useCallback((key: keyof BuildPairingParams, value: string) => {
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
  const continueWindow = useMemo<BuildPairingParams | null>(() => {
    if (rosterRun && pairings.some((pairing) => !pairing.deleted && pairing.rosterRunId === rosterRun.id)) return params
    const other = committed.find((row) => row.runStatus === 'draft')
    return other ? { dateFrom: other.runDateFrom, dateTo: other.runDateTo, base: params.base } : null
  }, [committed, pairings, params, rosterRun])

  return {
    params,
    bases,
    flights,
    pairings,
    rosterRun,
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
    setDateFrom: (value) => setParam('dateFrom', value),
    setDateTo: (value) => setParam('dateTo', value),
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
