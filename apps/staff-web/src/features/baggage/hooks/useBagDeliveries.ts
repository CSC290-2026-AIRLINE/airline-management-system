import { useEffect, useState } from 'react'
import {
  useBagDeliveryApi,
  type BagDelivery,
  type BagDeliveryDetail,
  type DeliveryChoiceBody,
  type HandOverBody,
} from '../api/bag-deliveries'
import { errorMessage } from './useFoundBags'

interface ListState {
  /** Which reload the data belongs to; while it differs from the current one, the list is loading. */
  forKey: number | null
  error: string | null
  deliveries: BagDelivery[]
}

interface DetailState {
  /** `<id>:<reload>` the data belongs to. */
  forKey: string | null
  error: string | null
  detail: BagDeliveryDetail | null
}

/**
 * Every delivery in the API's order (bags to send first, delivered last), and the one of the selected case with its
 * ownership checks. Every action reloads both, because a status change also changes the list row. A failed handover
 * reloads too, so the failed check shows up in the history.
 */
export function useBagDeliveries(selectedCaseId: string | undefined) {
  const api = useBagDeliveryApi()
  const [reloadKey, setReloadKey] = useState(0)
  const [list, setList] = useState<ListState>({ forKey: null, error: null, deliveries: [] })
  const [detail, setDetail] = useState<DetailState>({ forKey: null, error: null, detail: null })
  const selectedId = selectedCaseId ? list.deliveries.find((d) => d.reportId === selectedCaseId)?.id : undefined
  const detailKey = selectedId ? `${selectedId}:${reloadKey}` : null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const deliveries = await api.list()
        if (!cancelled) setList({ forKey: reloadKey, error: null, deliveries })
      } catch (e: unknown) {
        if (!cancelled) setList((prev) => ({ ...prev, forKey: reloadKey, error: errorMessage(e) }))
      }
    })()
    return () => {
      cancelled = true
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useFoundBagApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    ;(async () => {
      try {
        const row = await api.get(selectedId)
        if (!cancelled) setDetail({ forKey: detailKey, error: null, detail: row })
      } catch (e: unknown) {
        if (!cancelled) setDetail({ forKey: detailKey, error: errorMessage(e), detail: null })
      }
    })()
    return () => {
      cancelled = true
    }
    // See above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailKey])

  const reload = () => setReloadKey((k) => k + 1)

  async function run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action()
    } finally {
      reload()
    }
  }

  const current = detail.detail?.id === selectedId ? detail.detail : null

  return {
    deliveries: list.deliveries,
    listError: list.error,
    // Keep showing the old rows during a reload after an action, so the cards do not flash.
    loading: list.forKey === null,
    detail: current,
    detailError: detail.forKey === detailKey ? detail.error : null,
    /** The selected case has a delivery row (false while the list is still loading). */
    selectedFound: !!selectedId,
    detailLoading: !!selectedCaseId && !current && (list.forKey === null || (!!selectedId && detail.forKey !== detailKey)),
    reload,
    recordChoice: (id: string, body: DeliveryChoiceBody) => run(() => api.recordChoice(id, body)),
    setStatus: (id: string, status: 'in_transit' | 'ready_for_pickup') => run(() => api.setStatus(id, status)),
    handOver: (id: string, body: HandOverBody) => run(() => api.handOver(id, body)),
  }
}
