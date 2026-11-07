import { useEffect, useState } from 'react'
import { useBagMatchApi, type BagMatch } from '../api/bag-matches'
import { useFoundBagApi, type FoundBag } from '../api/found-bags'
import { errorMessage } from './useFoundBags'

interface ListState {
  /** Which reload the data belongs to; while it differs from the current one, the list is loading. */
  forKey: number | null
  error: string | null
  matches: BagMatch[]
}

/**
 * Every match, in the API's review order (open first, strong on top). Lost bag cases and Match review both filter it
 * on the client. Linking, confirming and rejecting reload the list, because confirming also rejects other matches.
 */
export function useBagMatches() {
  const api = useBagMatchApi()
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<ListState>({ forKey: null, error: null, matches: [] })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const matches = await api.list()
        if (!cancelled) setState({ forKey: reloadKey, error: null, matches })
      } catch (e: unknown) {
        if (!cancelled) setState((prev) => ({ ...prev, forKey: reloadKey, error: errorMessage(e) }))
      }
    })()
    return () => {
      cancelled = true
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useFoundBagApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  const reload = () => setReloadKey((k) => k + 1)

  async function link(reportId: string, foundBagId: string): Promise<BagMatch> {
    const match = await api.link(reportId, foundBagId)
    reload()
    return match
  }

  async function confirm(id: string, note: string): Promise<BagMatch> {
    const match = await api.confirm(id, note)
    reload()
    return match
  }

  async function reject(id: string, note?: string): Promise<BagMatch> {
    const match = await api.reject(id, note)
    reload()
    return match
  }

  const { forKey, ...data } = state
  // Keep showing the old rows during a reload after an action, so the cards do not flash.
  return { ...data, loading: forKey === null, reload, link, confirm, reject }
}

/** Held found bags, for "Link a found bag by hand". Loads when `enabled` turns on. */
export function useHeldBags(enabled: boolean) {
  const api = useFoundBagApi()
  const [bags, setBags] = useState<FoundBag[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    api
      .list('held')
      .then((rows) => {
        if (!cancelled) setBags(rows)
      })
      .catch(() => {
        if (!cancelled) setBags([])
      })
    return () => {
      cancelled = true
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useFoundBagApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return bags
}
