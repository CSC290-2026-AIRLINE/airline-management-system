import { useCallback, useEffect, useState } from 'react'
import type { DataSource } from './dataSource'

/** One page of a list, as the reports endpoints return it. */
export interface PagedPage<TItem> {
  /** How many rows match the query, not just the ones on this page. */
  total: number
  items: TItem[]
  /** Cursor for the next page, or `null` when this is the last one. */
  next_cursor: string | null
}

export interface PagedListState<TItem, TPage extends PagedPage<TItem> = PagedPage<TItem>> {
  loading: boolean
  /** Set when the API call failed. The list still renders — from the fixture — and shows this in the status pill. */
  error: string | null
  source: DataSource
  items: TItem[]
  /** How many rows match the query, not just the ones on screen. */
  total: number
  /** The page as the endpoint returned it, for the fields the list does not surface. */
  raw: TPage | null
  /** Zero-based index of the page on screen. */
  page: number
  /** How many rows a page holds. */
  limit: number
  canGoBack: boolean
  canGoForward: boolean
  /** Go to the next page. */
  next: () => void
  /** Go back to the previous page. */
  back: () => void
  /** Refetch the page on screen in place. */
  reload: () => void
}

interface UsePagedListOptions<TItem, TPage extends PagedPage<TItem>> {
  /** Identifies the query. Changing it starts a new list at its first page. */
  queryKey: string
  /** How many rows a page holds. */
  limit: number
  /** Fetches one page from the API. */
  load: (cursor: string | null) => Promise<TPage>
  /** Serves one page when the API is unreachable. */
  fallback: (cursor: string | null) => TPage
}

/**
 * A list of rows that is read one page at a time, the way the reports endpoints serve them.
 *
 * The cursor of every page the user walked through is kept per query, so changing a filter starts a fresh list and
 * going back to a filter returns to the page it was on. Until the backend endpoints exist, a failed request falls
 * back to the design's own rows — with `source: 'fixture'` so the UI can say so out loud.
 */
export function usePagedList<TItem, TPage extends PagedPage<TItem> = PagedPage<TItem>>({
  queryKey,
  limit,
  load,
  fallback,
}: UsePagedListOptions<TItem, TPage>): PagedListState<TItem, TPage> {
  const [stacks, setStacks] = useState<Record<string, (string | null)[]>>({})
  const [state, setState] = useState<{ loading: boolean; error: string | null; source: DataSource; page: TPage | null }>({
    loading: true,
    error: null,
    source: 'api',
    page: null,
  })

  /** Bumped by `reload()` so Retry refetches in place instead of reloading the whole page. */
  const [reloadKey, setReloadKey] = useState(0)

  const stack = stacks[queryKey] ?? [null]
  const cursor = stack[stack.length - 1] ?? null
  const page = stack.length - 1

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const loaded = await load(cursor)
        if (cancelled) return
        setState({ loading: false, error: null, source: 'api', page: loaded })
      } catch (e: unknown) {
        if (cancelled) return
        setState({
          loading: false,
          error: e instanceof Error ? e.message : String(e),
          source: 'fixture',
          page: fallback(cursor),
        })
      }
    })()
    return () => {
      cancelled = true
    }
    // The fetch helpers are rebuilt every render, so they cannot be dependencies. `queryKey` and `cursor` are the
    // real signals that the page on screen changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, cursor, reloadKey])

  const next = useCallback(() => {
    const nextCursor = state.page?.next_cursor
    if (!nextCursor) return
    setStacks((prev) => ({ ...prev, [queryKey]: [...(prev[queryKey] ?? [null]), nextCursor] }))
  }, [queryKey, state.page])

  const back = useCallback(() => {
    setStacks((prev) => {
      const current = prev[queryKey] ?? [null]
      if (current.length <= 1) {
        return prev
      }
      return { ...prev, [queryKey]: current.slice(0, -1) }
    })
  }, [queryKey])

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1)
  }, [])

  return {
    loading: state.loading,
    error: state.error,
    source: state.source,
    items: state.page?.items ?? [],
    total: state.page?.total ?? 0,
    raw: state.page,
    page,
    limit,
    canGoBack: page > 0,
    canGoForward: Boolean(state.page?.next_cursor),
    next,
    back,
    reload,
  }
}
