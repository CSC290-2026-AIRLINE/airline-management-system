import { useEffect, useRef, useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'

interface Page<T> {
  data: T[]
  nextCursor: string | null
}

interface State<T> {
  path: string
  rows: T[]
  next: string | null
  error: string | null
}

const BASE = '/api/flight-scheduling'

// Message from a Nest error body ({ message: string | string[] }), else the HTTP status.
async function errorMessage(res: Response) {
  try {
    const body = (await res.json()) as { message?: string | string[] }
    if (body.message) return [body.message].flat().join(', ')
  } catch {
    // body was not JSON
  }
  return `HTTP ${res.status}`
}

// GET a cursor-paged list from the flight-scheduling API; `loadMore` appends the next page.
// ponytail: local to this feature, no cache. Swap for TanStack Query once the Dev Leads add the shared setup.
export function usePagedList<T>(path: string) {
  const { fetchWithAuth } = useAppAuth()
  const fetchRef = useRef(fetchWithAuth)
  useEffect(() => {
    fetchRef.current = fetchWithAuth
  })

  const [state, setState] = useState<State<T> | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  async function fetchPage(cursor: string | null): Promise<Page<T>> {
    const url = cursor ? `${BASE}${path}${path.includes('?') ? '&' : '?'}cursor=${cursor}` : `${BASE}${path}`
    const res = await fetchRef.current(url)
    if (!res.ok) throw new Error(await errorMessage(res))
    return (await res.json()) as Page<T>
  }

  useEffect(() => {
    let stale = false
    fetchPage(null)
      .then((page) => !stale && setState({ path, rows: page.data, next: page.nextCursor, error: null }))
      .catch((e: unknown) => !stale && setState({ path, rows: [], next: null, error: e instanceof Error ? e.message : String(e) }))
    return () => {
      stale = true
    }
    // fetchPage only reads `path` and the ref, so `path` is the whole dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  async function loadMore() {
    if (!state?.next) return
    setLoadingMore(true)
    try {
      const page = await fetchPage(state.next)
      setState({ ...state, rows: [...state.rows, ...page.data], next: page.nextCursor })
    } catch (e) {
      setState({ ...state, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoadingMore(false)
    }
  }

  return {
    // a state left over from another path is not the answer to this one
    loading: state?.path !== path,
    rows: state?.path === path ? state.rows : [],
    error: state?.path === path ? state.error : null,
    hasMore: state?.path === path && state.next !== null,
    loadingMore,
    loadMore,
  }
}
