import { useCallback, useEffect, useState } from 'react'
import { useGetReportOverview, useListReportSessions } from '../api/reports'
import { fixtureOverview, fixtureSessions } from '../fixtures'
import type { ReportOverview, ReportPeriod, ReportSession } from '../types'
import type { DataSource } from './dataSource'

export type { DataSource }

export interface ReportsOverviewState {
  loading: boolean
  /** Set when the API call failed. The screen still renders — from the fixture — and shows this in the status pill. */
  error: string | null
  source: DataSource
  overview: ReportOverview | null
  sessions: ReportSession[]
  /** How many sessions exist in total, not just the rows on screen. */
  totalSessions: number
  /** Refetch in place. */
  reload: () => void
}

const EMPTY_SESSIONS: ReportSession[] = []

/**
 * Loads the overview (stat cards + sessions-per-day series) and the session list for one reporting period.
 *
 * Until the backend endpoints exist, a failed request falls back to the design's own figures so the screen
 * still looks like the Figma frame — with `source: 'fixture'` so the UI can say so out loud.
 */
export function useReportsOverview(period: ReportPeriod): ReportsOverviewState {
  const getReportOverview = useGetReportOverview()
  const listReportSessions = useListReportSessions()

  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    source: DataSource
    overview: ReportOverview | null
    sessions: ReportSession[]
    totalSessions: number
  }>({ loading: true, error: null, source: 'api', overview: null, sessions: EMPTY_SESSIONS, totalSessions: 0 })

  /** Bumped by `reload()` so Retry refetches in place instead of reloading the whole page. */
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const [overview, page] = await Promise.all([getReportOverview(period), listReportSessions({ limit: 7 })])
        if (cancelled) return
        setState({
          loading: false,
          error: null,
          source: 'api',
          overview,
          sessions: page.items,
          totalSessions: page.total,
        })
      } catch (e: unknown) {
        if (cancelled) return
        const fallback = fixtureSessions()
        setState({
          loading: false,
          error: e instanceof Error ? e.message : String(e),
          source: 'fixture',
          overview: fixtureOverview(period),
          sessions: fallback.items,
          totalSessions: fallback.total,
        })
      }
    })()
    return () => {
      cancelled = true
    }
    // The fetch helpers are rebuilt every render, so they cannot be dependencies. `reloadKey` is the retry signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, reloadKey])

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1)
  }, [])

  return { ...state, reload }
}
