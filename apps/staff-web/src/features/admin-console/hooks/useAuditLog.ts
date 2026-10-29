import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuditPage } from '../types'
import type { AuditQuery } from '../api/audit'

interface UseAuditLogState {
  loading: boolean
  error: string | null
  page: AuditPage | null
}

/**
 * Cursor pagination by `seq` (decimal string, descending). When the caller's filters or limit change, the request id
 * resets and we start over from the first page. We use the render-time "adjusting state when a prop changes" pattern
 * (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes) to keep cursor
 * management off the consumer page — no `setState` is called inside an effect body.
 */
export function useAuditLog(
  filters: Pick<AuditQuery, 'source_feature' | 'actor_type' | 'action' | 'from' | 'to'>,
  limit: number,
  fetchAudit: (q: AuditQuery) => Promise<AuditPage>,
) {
  const filtersKey = stableKeyOf(filters)
  /* `pageIndex` and `rowsBefore` are navigation bookkeeping, not fetch inputs — they are deliberately left out of
     the effect's dependency list below. `rowsBefore` is how many rows sit on the pages ahead of this one, so the
     page can render "Showing 26–50 of N entries" without a total-count endpoint. */
  const [request, setRequest] = useState({ filtersKey, cursor: null as string | null, limit, pageIndex: 0, rowsBefore: 0 })
  const [state, setState] = useState<UseAuditLogState>({ loading: true, error: null, page: null })

  // Render-time comparison — see hook header. If inputs drifted, schedule a fresh request and let React re-render
  // with the new request before the effect below fetches.
  if (request.filtersKey !== filtersKey || request.limit !== limit) {
    setRequest({ filtersKey, cursor: null, limit, pageIndex: 0, rowsBefore: 0 })
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const page = await fetchAudit({ ...filters, cursor: request.cursor, limit: request.limit })
        if (cancelled) return
        setState({ loading: false, error: null, page })
      } catch (e: unknown) {
        if (cancelled) return
        setState({ loading: false, error: e instanceof Error ? e.message : String(e), page: null })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.filtersKey, request.cursor, request.limit])

  const nextPage = useCallback(() => {
    const next = state.page?.next_cursor
    if (!next) return
    // Capture the page we are leaving so its row count can be added to the running offset.
    const leaving = state.page?.items.length ?? 0
    setRequest((prev) => ({ ...prev, cursor: next, pageIndex: prev.pageIndex + 1, rowsBefore: prev.rowsBefore + leaving }))
  }, [state.page])

  /* Going back rewinds to the first page rather than stepping one cursor back — the endpoint only hands out a
     "next" cursor, so an arbitrary page can't be re-requested. Page index and offset reset with it. */
  const prevPage = useCallback(() => {
    setRequest((prev) => (prev.cursor === null ? prev : { ...prev, cursor: null, pageIndex: 0, rowsBefore: 0 }))
  }, [])

  const hasPrev = request.cursor !== null

  return useMemo(
    () => ({
      ...state,
      nextPage,
      prevPage,
      hasPrev,
      pageIndex: request.pageIndex,
      rowsBefore: request.rowsBefore,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.loading, state.error, state.page, hasPrev, request.pageIndex, request.rowsBefore],
  )
}

function stableKeyOf(f: Record<string, unknown>): string {
  return JSON.stringify(f)
}
