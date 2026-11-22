/**
 * State for the published-rosters history page.
 *
 * The list of rounds comes in one request. A round's roster is read only when its card is opened, so a long history costs
 * one request per card the operator actually looks at. Raising a sick call writes through the same Fix & publish API the
 * workspace uses; the page then hands over to the workspace to find the cover.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppAuth } from '../../../../auth/AuthProvider'
import { createFixPublishApi } from '../../fix-publish/types/api'
import type { FixPublishData, PublishedRunSummary } from '../../fix-publish/types/types'

export type LoadState = 'loading' | 'ready' | 'error'
export type RosterLoad = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: FixPublishData }

export interface PublishedRostersState {
  loadState: LoadState
  loadError: string | null
  runs: PublishedRunSummary[]
  /** Which round cards are open. */
  expanded: ReadonlySet<string>
  rosters: ReadonlyMap<string, RosterLoad>
  toggle: (runId: string) => void
  isBusy: boolean
  /** Why the last sick call failed, in the backend's words. */
  actionError: string | null
  /** Takes the person off the leg. Resolves true when it went through. */
  raiseSickCall: (runId: string, legId: string, memberId: string, reason: string) => Promise<boolean>
}

const NOT_SIGNED_IN = 'Could not sign in to the API. Sign out, sign in again, and check that the backend is running on port 8080.'

export function usePublishedRosters(): PublishedRostersState {
  const { accessToken, isLoading: authLoading, fetchWithAuth } = useAppAuth()
  // `fetchWithAuth` is a new function on every provider render; the ref keeps `getApi` stable.
  const fetchRef = useRef(fetchWithAuth)
  useEffect(() => {
    fetchRef.current = fetchWithAuth
  }, [fetchWithAuth])
  const getApi = useCallback(() => createFixPublishApi(fetchRef.current), [])
  const signedIn = accessToken !== null

  const [runs, setRuns] = useState<PublishedRunSummary[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [rosters, setRosters] = useState<ReadonlyMap<string, RosterLoad>>(new Map())
  const [isBusy, setIsBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadRoster = useCallback(
    (runId: string) => {
      setRosters((current) => new Map(current).set(runId, { state: 'loading' }))
      getApi()
        .getRun(runId)
        .then((data) => setRosters((current) => new Map(current).set(runId, { state: 'ready', data })))
        .catch((error: unknown) =>
          setRosters((current) =>
            new Map(current).set(runId, {
              state: 'error',
              message: error instanceof Error ? error.message : 'Could not load this roster.',
            }),
          ),
        )
    },
    [getApi],
  )

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    getApi()
      .listPublished()
      .then((list) => {
        if (cancelled) return
        setRuns(list)
        setLoadState('ready')
        // The newest round opens by itself, since it is the one most often reopened for a sick call.
        if (list[0]) {
          setExpanded(new Set([list[0].id]))
          loadRoster(list[0].id)
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : 'Could not load the published rosters.')
        setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [getApi, loadRoster, signedIn])

  const toggle = useCallback(
    (runId: string) => {
      const opening = !expanded.has(runId)
      setExpanded((current) => {
        const next = new Set(current)
        if (opening) next.add(runId)
        else next.delete(runId)
        return next
      })
      if (opening && rosters.get(runId)?.state !== 'ready') loadRoster(runId)
    },
    [expanded, loadRoster, rosters],
  )

  const raiseSickCall = useCallback(
    async (runId: string, legId: string, memberId: string, reason: string): Promise<boolean> => {
      if (isBusy) return false
      setIsBusy(true)
      setActionError(null)
      try {
        await getApi().sickCall(runId, { legId, memberId, reason })
        return true
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'Something went wrong. Try again.')
        return false
      } finally {
        setIsBusy(false)
      }
    },
    [getApi, isBusy],
  )

  return {
    // Without a token the load effect never runs, so say why instead of loading forever.
    loadState: signedIn ? loadState : authLoading ? 'loading' : 'error',
    loadError: signedIn ? loadError : authLoading ? null : NOT_SIGNED_IN,
    runs,
    expanded,
    rosters,
    toggle,
    isBusy,
    actionError,
    raiseSickCall,
  }
}
