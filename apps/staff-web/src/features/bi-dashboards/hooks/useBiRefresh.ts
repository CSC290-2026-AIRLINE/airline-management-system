import { useState } from 'react'
import { useBiApi, type BiRun } from '../api/bi'
import type { BiRefreshControl } from '../components/BiPageFrame'
import { refreshMessage } from './useBiDashboard'
import { useBiLoad } from './useBiLoad'

/**
 * The Refresh button for the panel views (Operations has its own in useBiDashboard): the shared status, the refresh
 * call, and `onDone` to reload the view's own data afterwards. The Financial report has no Refresh: Feature 4 computes
 * its figures, and BI only reads them.
 */
export function useBiRefresh(onDone: () => void): { latest: BiRun | null; refresh: BiRefreshControl } {
  const api = useBiApi()
  const status = useBiLoad('bi-status', () => api.getStatus())
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = status.data?.latest_success ?? status.previousData?.latest_success ?? null
  const lastRun = status.data?.last_run ?? status.previousData?.last_run ?? null

  async function refresh() {
    setRefreshing(true)
    setError(null)
    try {
      await api.refresh()
      status.retry()
      onDone()
    } catch (caught) {
      setError(refreshMessage(caught))
    } finally {
      setRefreshing(false)
    }
  }

  return {
    latest,
    refresh: { onRefresh: () => void refresh(), refreshing, error, lastRunFailed: lastRun?.status === 'failed' },
  }
}
