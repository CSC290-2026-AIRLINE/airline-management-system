/**
 * All fix-publish state in one place.
 *
 * The roster, its breaks and the candidate lists live in the backend
 * (`/api/crew-rostering/fix-publish`). Every edit — a swap, an override, a sick call, a
 * publish, a re-check — is one request that answers with the whole page state, so the
 * list on the left, the panel on the right and the closed table can never disagree: they
 * are all read from the same answer. The hook keeps only what the server does not:
 * which item is selected, and the sentences about the edit just made.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { useAppAuth } from '../../../../auth/AuthProvider'
import { formatDateRange } from '../../build-pairings/types/format'
import type { BuildPairingParams } from '../../build-pairings/types/types'
import { DEFAULT_PARAMS } from '../../assign-crew/types/mock-data'
import { parseWindowSearch } from '../../shared/window-search'
import { createFixPublishApi } from './api'
import type {
  FixBreak,
  FixOutcome,
  FixPublishData,
  LegAssignment,
  PageBanner,
  PublishCheck,
  RosterStatus,
  RunInfo,
  RuleLimits,
} from './types'

export type LoadState = 'idle' | 'loading' | 'error'

const NOT_SIGNED_IN = 'Could not sign in to the API. Sign out, sign in again, and check that the backend is running on port 8080.'

export interface FixPublishState {
  params: BuildPairingParams
  rosterRun: RunInfo | null
  limits: RuleLimits | null
  loadState: LoadState
  /** Why the last load or edit failed, in the backend's words. */
  loadError: string | null
  /** True while an edit is in flight, so a second click does not send a second one. */
  isBusy: boolean
  assignments: LegAssignment[]
  /** Every open and closed item, in the order the left list numbers them. */
  breaks: FixBreak[]
  openBreaks: FixBreak[]
  selectedBreak: FixBreak | null
  selectBreak: (id: string) => void
  status: RosterStatus
  /** `Draft` or `Published` — the label on the run badge. */
  rosterStatusLabel: string
  /** `Open breaks`, `Sick call` or `Uncovered leg`; null when there is nothing open. */
  heading: string | null
  /** How many items the run has ever had, so the progress bar has a fixed length. */
  totalItems: number
  /** The green sentence describing the fix that was just applied. */
  fixNotice: string | null
  /** The full-width strip above the workspace. */
  banner: PageBanner | null
  canPublish: boolean
  publishChecks: PublishCheck[]
  publish: () => void
  swapIn: (breakId: string, candidateId: string) => void
  overrideBreak: (breakId: string, reason: string) => void
  /** True once a seat a sick call left open has been refilled. */
  isUpdated: boolean
  raiseSickCall: (legId: string, memberId: string, reason: string) => void
  /** Selects the open item on a leg, for the roster table's `Find cover` button. */
  coverLeg: (legId: string) => void
  /** Re-reads the flights and re-checks every rule, for when Feature 2 has moved something. */
  recheck: () => void
  /** The roster row the published table needs for one leg. */
  rosterFor: (legId: string) => LegAssignment | undefined
  /** Legs that are still missing a seat. */
  uncoveredLegIds: readonly string[]
}

export function useFixPublish(): FixPublishState {
  const { accessToken, isLoading: authLoading, fetchWithAuth } = useAppAuth()
  // `fetchWithAuth` is a new function on every provider render. Reading it through a ref
  // keeps `getApi` stable, so the load effect runs when the window changes, not on every render.
  const fetchRef = useRef(fetchWithAuth)
  useEffect(() => {
    fetchRef.current = fetchWithAuth
  }, [fetchWithAuth])
  const getApi = useCallback(() => createFixPublishApi(fetchRef.current), [])
  const signedIn = accessToken !== null

  const search = useSearch({ strict: false }) as Record<string, unknown>
  const [params] = useState<BuildPairingParams>(() => ({ ...DEFAULT_PARAMS, ...parseWindowSearch(search) }))

  const [data, setData] = useState<FixPublishData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [fixNotice, setFixNotice] = useState<string | null>(null)
  const [updateNote, setUpdateNote] = useState<string | null>(null)

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    const api = getApi()
    api
      .getState(params)
      // Opening the page re-checks every rule first, so the breaks shown are what the rules say
      // about the roster as it is now, and a run nobody has crewed yet cannot look ready to publish.
      .then((loaded) => (loaded.rosterRun ? api.check(loaded.rosterRun.id) : loaded))
      .then((loaded) => {
        if (cancelled) return
        setData(loaded)
        setLoadState('idle')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : 'Could not load the roster.')
        setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [getApi, signedIn, params])

  const breaks = useMemo(() => [...(data?.breaks ?? [])].sort((a, b) => a.position - b.position), [data])
  const openBreaks = useMemo(() => breaks.filter((item) => item.resolution === undefined), [breaks])
  const status: RosterStatus = data?.rosterRun?.status === 'published' ? 'published' : 'draft'
  const selectedBreak = breaks.find((item) => item.id === selectedId) ?? openBreaks[0] ?? null
  const canPublish = data?.rosterRun != null && openBreaks.length === 0 && status === 'draft' && !isBusy

  /** Runs an edit, shows its failure as the page error, and keeps the page usable either way. */
  const edit = useCallback(async (write: () => Promise<FixOutcome | FixPublishData>): Promise<FixOutcome | FixPublishData | null> => {
    setIsBusy(true)
    setLoadError(null)
    try {
      const answer = await write()
      setData('state' in answer ? answer.state : answer)
      return answer
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Something went wrong. Try again.')
      return null
    } finally {
      setIsBusy(false)
    }
  }, [])

  const swapIn = useCallback(
    (breakId: string, candidateId: string) => {
      if (isBusy) return
      const target = breaks.find((item) => item.id === breakId)
      const who = target?.replacement?.candidates.find((candidate) => candidate.member.id === candidateId)?.member.name
      void edit(() => getApi().swap(breakId, candidateId)).then((answer) => {
        if (!answer || !('banner' in answer)) return
        setFixNotice(answer.banner)
        setSelectedId(null)
        // On a live roster, filling an empty seat is the "roster updated" moment.
        if (answer.closed && status === 'published' && target) {
          setUpdateNote(`${who ?? 'A replacement'} filled the open seat on ${target.flightNumber}.`)
        }
      })
    },
    [breaks, edit, getApi, isBusy, status],
  )

  const overrideBreak = useCallback(
    (breakId: string, reason: string) => {
      if (isBusy) return
      void edit(() => getApi().override(breakId, reason)).then((answer) => {
        if (!answer || !('banner' in answer)) return
        setFixNotice(answer.banner)
        setSelectedId(null)
      })
    },
    [edit, getApi, isBusy],
  )

  const raiseSickCall = useCallback(
    (legId: string, memberId: string, reason: string) => {
      const runId = data?.rosterRun?.id
      if (!runId || isBusy) return
      void edit(() => getApi().sickCall(runId, { legId, memberId, reason })).then((answer) => {
        if (!answer || !('state' in answer)) return
        setFixNotice(null)
        setUpdateNote(null)
        setSelectedId(answer.state.breaks.find((item) => item.legId === legId && item.resolution === undefined)?.id ?? null)
      })
    },
    [data, edit, getApi, isBusy],
  )

  const publish = useCallback(() => {
    const runId = data?.rosterRun?.id
    if (!runId || !canPublish) return
    void edit(() => getApi().publish(runId)).then(() => setSelectedId(null))
  }, [canPublish, data, edit, getApi])

  const recheck = useCallback(() => {
    const runId = data?.rosterRun?.id
    if (!runId || isBusy) return
    void edit(() => getApi().check(runId)).then(() => setFixNotice(null))
  }, [data, edit, getApi, isBusy])

  const coverLeg = useCallback(
    (legId: string) => {
      const item = openBreaks.find((open) => open.legId === legId)
      if (item) setSelectedId(item.id)
    },
    [openBreaks],
  )

  const rosterFor = useCallback((legId: string) => data?.assignments.find((assignment) => assignment.leg.legId === legId), [data])

  const banner = useMemo<PageBanner | null>(() => {
    if (!data?.rosterRun) return null

    if (status === 'published') {
      const uncovered = openBreaks.find((item) => item.code === 'NO_LEGAL_CREW' || item.removed)
      if (uncovered) {
        return {
          tone: 'warning',
          text: `Roster published · ${uncovered.flightNumber} is not covered: ${uncovered.shortDetail} (${uncovered.code}).`,
        }
      }
      if (updateNote) return { tone: 'success', text: `Roster updated · ${updateNote}` }
      const range = formatDateRange(data.rosterRun.dateFrom, data.rosterRun.dateTo)
      return {
        tone: 'success',
        text: `Roster published · ${range} · ${data.assignments.length} legs. Crew notification (Feature 13) is not connected yet.`,
      }
    }

    const closed = breaks.filter((item) => item.resolution !== undefined)
    if (openBreaks.length === 0 && closed.length === 0) {
      return { tone: 'success', text: 'No rule breaks · every leg passes the law and company rules. The roster is ready to publish.' }
    }
    if (openBreaks.length === 0) {
      const overridden = closed.filter((item) => item.resolution?.kind === 'overridden').length
      const fixed = closed.length - overridden
      return {
        tone: 'success',
        text:
          overridden > 0
            ? `All breaks closed · ${fixed} fixed, ${overridden} overridden with a reason. The roster is ready to publish.`
            : 'All breaks fixed · the roster is legal and ready to publish.',
      }
    }

    return null
  }, [breaks, data, openBreaks, status, updateNote])

  const heading = useMemo(() => {
    if (openBreaks.length === 0) return null
    const seats = openBreaks.filter((item) => item.code === 'NO_LEGAL_CREW')
    if (status !== 'published' || seats.length === 0) return 'Open breaks'
    return seats.some((item) => (item.replacement?.allowedCount ?? 0) > 0) ? 'Sick call' : 'Uncovered leg'
  }, [openBreaks, status])

  return {
    params,
    rosterRun: data?.rosterRun ?? null,
    limits: data?.limits ?? null,
    // Without a token the load effect never runs, so say why instead of loading forever.
    loadState: signedIn ? loadState : authLoading ? 'loading' : 'error',
    loadError: signedIn ? loadError : authLoading ? null : NOT_SIGNED_IN,
    isBusy,
    assignments: data?.assignments ?? [],
    breaks,
    openBreaks,
    selectedBreak,
    selectBreak: setSelectedId,
    status,
    rosterStatusLabel: status === 'published' ? 'Published' : data?.rosterRun ? 'Draft' : 'Not committed',
    heading,
    totalItems: breaks.length,
    fixNotice,
    banner,
    canPublish,
    publishChecks: data?.publishChecks ?? [],
    publish,
    swapIn,
    overrideBreak,
    isUpdated: updateNote !== null,
    raiseSickCall,
    coverLeg,
    recheck,
    rosterFor,
    uncoveredLegIds: data?.uncoveredLegIds ?? [],
  }
}
