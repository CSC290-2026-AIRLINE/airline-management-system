import { useEffect, useState } from 'react'
import { filterQuery, useBiApi, type BiFilters, type BiKpisResponse, type BiRouteRow, type BiStatus } from '../api/bi'

export interface BiDashboardData {
  status: BiStatus
  kpis: BiKpisResponse
  routes: BiRouteRow[]
}

type LoadResult = { requestKey: string; data: BiDashboardData } | { requestKey: string; error: string }

/**
 * Loads the status, KPIs and route table for the filters. Only current results are exposed as figures; the last
 * successful response is separate so route options and refresh status remain available during a new request.
 */
export function useBiDashboard(filters: BiFilters) {
  const api = useBiApi()
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<LoadResult | null>(null)
  const [previousData, setPreviousData] = useState<BiDashboardData | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const requestKey = `${filterQuery(filters)}#${reloadCount}`
  const [selection, setSelection] = useState(requestKey)
  if (selection !== requestKey) {
    setSelection(requestKey)
    setResult(null)
  }

  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to)

  useEffect(() => {
    if (invalidDates) return
    let active = true
    Promise.all([api.getStatus(), api.getKpis(filters), api.getRoutes({ ...filters, from: '', to: '' })])
      .then(([status, kpis, routes]) => {
        if (active) {
          const data = { status, kpis, routes }
          setResult({ requestKey, data })
          setPreviousData(data)
        }
      })
      .catch((error: unknown) => {
        if (active) setResult({ requestKey, error: messageOf(error) })
      })
    return () => {
      active = false
    }
    // The API helpers are rebuilt on every render, so the request key is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, invalidDates])

  // A scheduled refresh may start in another session. Poll only while that run is active.
  const serverRefreshing = (result && 'data' in result ? result.data.status : previousData?.status)?.refreshing
  useEffect(() => {
    if (!serverRefreshing) return
    const timer = window.setTimeout(() => setReloadCount((count) => count + 1), 5000)
    return () => window.clearTimeout(timer)
  }, [serverRefreshing, reloadCount])

  async function refresh() {
    setRefreshing(true)
    setRefreshError(null)
    try {
      await api.refresh()
      setReloadCount((count) => count + 1)
    } catch (error) {
      setRefreshError(refreshMessage(error))
    } finally {
      setRefreshing(false)
    }
  }

  const current = selection === requestKey && result?.requestKey === requestKey ? result : null
  return {
    data: current && 'data' in current ? current.data : null,
    previousData,
    loading: !invalidDates && current === null,
    error: !invalidDates && current && 'error' in current ? current.error : null,
    refresh,
    refreshing,
    refreshError,
    retry: () => setReloadCount((count) => count + 1),
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function refreshMessage(error: unknown): string {
  const message = messageOf(error)
  if (message.startsWith('409')) return 'A refresh is already running. Wait for it to finish, then try again.'
  if (message.startsWith('403')) return 'Only staff accounts can refresh the dashboards.'
  return `The refresh failed (${message}).`
}
