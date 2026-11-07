import { useEffect, useState } from 'react'
import { filterQuery, useBiApi, type BiFilters, type BiKpisResponse, type BiRouteRow, type BiStatus } from '../api/bi'

export interface BiDashboardData {
  status: BiStatus
  kpis: BiKpisResponse
  routes: BiRouteRow[]
}

type LoadResult = { requestKey: string; data: BiDashboardData } | { requestKey: string; error: string }

/**
 * Loads the status, KPIs and route table for the filters. While a new request is in flight the previous data stays on
 * screen, and `loading` tells the page to dim it.
 */
export function useBiDashboard(filters: BiFilters) {
  const api = useBiApi()
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<LoadResult | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const requestKey = `${filterQuery(filters)}#${reloadCount}`

  useEffect(() => {
    let active = true
    Promise.all([api.getStatus(), api.getKpis(filters), api.getRoutes(filters)])
      .then(([status, kpis, routes]) => {
        if (active) setResult({ requestKey, data: { status, kpis, routes } })
      })
      .catch((error: unknown) => {
        if (active) setResult({ requestKey, error: messageOf(error) })
      })
    return () => {
      active = false
    }
    // The API helpers are rebuilt on every render, so the request key is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

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

  const current = result?.requestKey === requestKey ? result : null
  return {
    data: result && 'data' in result ? result.data : null,
    loading: current === null,
    error: current && 'error' in current ? current.error : null,
    refresh,
    refreshing,
    refreshError,
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
