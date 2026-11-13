import { useEffect, useState } from 'react'
import {
  BaggageApiError,
  useFoundBagApi,
  type BagTrackingHistory,
  type FoundBag,
  type FoundBagListItem,
  type RecordFoundBagBody,
  type RecordMoveBody,
} from '../api/found-bags'
import type { BagColour, BagType, FoundBagStatus } from '../constants'
import { usePoll } from './usePoll'
import { useRetryWhileUnreachable } from './useRetryWhileUnreachable'

export interface Airport {
  code: string
  name: string
}

interface ListState {
  /** Which status filter and reload the data belongs to; while it differs from the current one, the list is loading. */
  forKey: string | null
  error: string | null
  bags: FoundBagListItem[]
  airports: Airport[]
}

export function errorMessage(e: unknown): string {
  if (e instanceof BaggageApiError) {
    if (e.status === 401) return 'Your sign-in has ended. Reload the page to sign in again.'
    // A 403 from the role guard has no baggage code; a coded one (such as SELF_CONFIRM) carries its own message.
    if (e.status === 403 && e.code === 'HTTP_403') return 'You need the baggage staff role to use the baggage desk.'
    return e.message
  }
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

/**
 * The Found bags list (each bag with where it is now), its status filter, and the airports (Feature 2's airport
 * table) for the dropdowns.
 */
export function useFoundBagList(status: FoundBagStatus | undefined) {
  const api = useFoundBagApi()
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<ListState>({ forKey: null, error: null, bags: [], airports: [] })
  const key = `${status ?? 'all'}:${reloadKey}`

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [bags, airports] = await Promise.all([api.list(status), api.airports()])
        if (!cancelled) setState({ forKey: key, error: null, bags, airports })
      } catch (e: unknown) {
        if (!cancelled) setState((prev) => ({ ...prev, forKey: key, error: errorMessage(e) }))
      }
    })()
    return () => {
      cancelled = true
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useFoundBagApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Quiet refresh: swap in fresh rows only when no reload is in flight, so nothing flashes.
  usePoll(async () => {
    const bags = await api.list(status)
    setState((prev) => (prev.forKey === key ? { ...prev, error: null, bags } : prev))
  })

  async function record(body: RecordFoundBagBody): Promise<FoundBag> {
    const bag = await api.record(body)
    setReloadKey((k) => k + 1)
    return bag
  }

  const reload = () => setReloadKey((k) => k + 1)
  useRetryWhileUnreachable(state.error, reload)

  const { forKey, ...data } = state
  return { ...data, loading: forKey !== key, record, reload }
}

interface DetailState {
  /** The bag id this data belongs to. */
  forId: string | null
  error: string | null
  bag: FoundBag | null
  history: BagTrackingHistory | null
}

/** One found bag and where it has been. Writes swap in what the server returns and tell the list to refresh. */
export function useFoundBagDetail(id: string | undefined, onChanged: () => void) {
  const api = useFoundBagApi()
  const [state, setState] = useState<DetailState>({ forId: null, error: null, bag: null, history: null })

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        const [bag, history] = await Promise.all([api.get(id), api.history(id)])
        if (!cancelled) setState({ forId: id, error: null, bag, history })
      } catch (e: unknown) {
        if (!cancelled) setState({ forId: id, error: errorMessage(e), bag: null, history: null })
      }
    })()
    return () => {
      cancelled = true
    }
    // See useFoundBagList.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function recordMove(body: RecordMoveBody) {
    if (!id) return
    const history = await api.recordMove(id, body)
    const bag = await api.get(id)
    setState((prev) => ({ ...prev, bag, history }))
    onChanged()
  }

  async function completeDetails(bagType: BagType, colour: BagColour) {
    if (!id) return
    const bag = await api.completeDetails(id, { bagType, colour })
    setState((prev) => ({ ...prev, bag }))
    onChanged()
  }

  async function continueWithFlight() {
    if (!id) return
    const bag = await api.continueWithFlight(id)
    const history = await api.history(id)
    setState((prev) => ({ ...prev, bag, history }))
    onChanged()
  }

  const current = id && state.forId === id
  return {
    loading: !!id && !current,
    error: current ? state.error : null,
    bag: current ? state.bag : null,
    history: current ? state.history : null,
    recordMove,
    completeDetails,
    continueWithFlight,
  }
}
