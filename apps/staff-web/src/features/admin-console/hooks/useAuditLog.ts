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
  enabled: boolean = true,
) {
  const filtersKey = stableKeyOf(filters)
  const [request, setRequest] = useState({ filtersKey, cursor: null as string | null, limit })
  const [state, setState] = useState<UseAuditLogState>({ loading: enabled, error: null, page: null })

  // Render-time comparison — see hook header. If inputs drifted, schedule a fresh request and let React re-render
  // with the new request before the effect below fetches.
  if (request.filtersKey !== filtersKey || request.limit !== limit) {
    setRequest({ filtersKey, cursor: null, limit })
  }

  // `enabled=false` simply parks the hook: the effect returns early and state keeps its last value. The consumer
  // (AuditLogPage) masks `loading`/`error` while it is dormant, so there is nothing to reset here — and resetting
  // would need a setState inside the effect body, which `react-hooks/set-state-in-effect` rejects.

  useEffect(() => {
    if (!enabled) return
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
  }, [enabled, request.filtersKey, request.cursor, request.limit])

  const nextPage = useCallback(() => {
    setRequest((prev) => {
      const next = state.page?.next_cursor
      if (!next) return prev
      return { ...prev, cursor: next }
    })
  }, [state.page])

  const prevPage = useCallback(() => {
    setRequest((prev) => (prev.cursor === null ? prev : { ...prev, cursor: null }))
  }, [])

  const hasPrev = request.cursor !== null

  return useMemo(
    () => ({ ...state, nextPage, prevPage, hasPrev }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.loading, state.error, state.page, hasPrev],
  )
}

function stableKeyOf(f: Record<string, unknown>): string {
  return JSON.stringify(f)
}
