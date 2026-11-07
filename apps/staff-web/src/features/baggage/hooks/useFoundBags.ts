import { useEffect, useState } from 'react'
import {
  BaggageApiError,
  useFoundBagApi,
  type BagTrackingHistory,
  type FoundBag,
  type RecordFoundBagBody,
  type RecordMoveBody,
} from '../api/found-bags'
import { FALLBACK_AIRPORTS, type BagColour, type BagType, type FoundBagStatus } from '../constants'

export interface Airport {
  code: string
  name: string
}

interface ListState {
  /** Which status filter and reload the data belongs to; while it differs from the current one, the list is loading. */
  forKey: string | null
  error: string | null
  bags: FoundBag[]
  /** Current airport of each bag, from its latest location event. */
  nowAt: Record<string, string>
  airports: Airport[]
}

export function errorMessage(e: unknown): string {
  if (e instanceof BaggageApiError) return e.status === 403 ? 'You need a staff account to use the baggage desk.' : e.message
  return e instanceof Error ? e.message : 'Something went wrong. Try again.'
}

/**
 * The Found bags list, its status filter, and the airports for the dropdowns. "Now at" needs one history call per bag
 * because the list endpoint does not return the current location yet.
 */
export function useFoundBagList(status: FoundBagStatus | undefined) {
  const api = useFoundBagApi()
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<ListState>({ forKey: null, error: null, bags: [], nowAt: {}, airports: FALLBACK_AIRPORTS })
  const key = `${status ?? 'all'}:${reloadKey}`

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [bags, stations] = await Promise.all([api.list(status), api.stations().catch(() => [])])
        const histories = await Promise.allSettled(bags.map((b) => api.history(b.id)))
        if (cancelled) return
        const nowAt: Record<string, string> = {}
        histories.forEach((h, i) => {
          nowAt[bags[i].id] = h.status === 'fulfilled' && h.value.current ? h.value.current.airportCode : bags[i].foundAirport
        })
        const airports = stations.length > 0 ? stations.map((s) => ({ code: s.airportCode, name: s.airportName })) : FALLBACK_AIRPORTS
        setState({ forKey: key, error: null, bags, nowAt, airports })
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

  async function record(body: RecordFoundBagBody): Promise<FoundBag> {
    const bag = await api.record(body)
    setReloadKey((k) => k + 1)
    return bag
  }

  const { forKey, ...data } = state
  return { ...data, loading: forKey !== key, record, reload: () => setReloadKey((k) => k + 1) }
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
