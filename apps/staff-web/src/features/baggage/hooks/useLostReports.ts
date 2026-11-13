import { useEffect, useState } from 'react'
import { useLostReportApi, type AddBagCostBody, type BagCostSummary, type LostReportCase } from '../api/lost-reports'
import { errorMessage } from './useFoundBags'
import { useRetryWhileUnreachable } from './useRetryWhileUnreachable'
import { usePoll } from './usePoll'

interface ListState {
  /** Which reload the data belongs to; while it differs from the current one, the list is loading. */
  forKey: number | null
  error: string | null
  cases: LostReportCase[]
}

/**
 * Every lost bag case, newest first (the API's order). The page filters and counts on the client because the KPI cards
 * need every status at once.
 */
export function useLostReports() {
  const api = useLostReportApi()
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<ListState>({ forKey: null, error: null, cases: [] })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cases = await api.list()
        if (!cancelled) setState({ forKey: reloadKey, error: null, cases })
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

  // Quiet refresh: swap in fresh rows only when no reload is in flight, so nothing flashes.
  usePoll(async () => {
    const cases = await api.list()
    setState((prev) => (prev.forKey === reloadKey ? { ...prev, error: null, cases } : prev))
  })

  const { forKey, ...data } = state
  const reload = () => setReloadKey((k) => k + 1)
  useRetryWhileUnreachable(state.error, reload)

  return { ...data, loading: forKey !== reloadKey, reload }
}

interface CostState {
  /** The case id this data belongs to. */
  forId: string | null
  error: string | null
  summary: BagCostSummary | null
}

/** The recovery costs of one case. Adding or removing a cost reloads the list, so the total always comes from the server. */
export function useCaseCosts(reportId: string | undefined) {
  const api = useLostReportApi()
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<CostState>({ forId: null, error: null, summary: null })
  const key = reportId ? `${reportId}:${reloadKey}` : null

  useEffect(() => {
    if (!reportId) return
    let cancelled = false
    ;(async () => {
      try {
        const summary = await api.costs(reportId)
        if (!cancelled) setState({ forId: key, error: null, summary })
      } catch (e: unknown) {
        if (!cancelled) setState({ forId: key, error: errorMessage(e), summary: null })
      }
    })()
    return () => {
      cancelled = true
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useFoundBagApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  async function add(body: AddBagCostBody): Promise<void> {
    if (!reportId) return
    await api.addCost(reportId, body)
    setReloadKey((k) => k + 1)
  }

  async function remove(costId: string): Promise<void> {
    if (!reportId) return
    await api.removeCost(reportId, costId)
    setReloadKey((k) => k + 1)
  }

  const fresh = state.forId === key
  return {
    // Keep showing the old rows while a reload after add or remove is in flight, so the card does not flash.
    summary: state.summary?.reportId === reportId ? state.summary : null,
    error: fresh ? state.error : null,
    loading: !fresh && state.summary?.reportId !== reportId,
    add,
    remove,
  }
}
