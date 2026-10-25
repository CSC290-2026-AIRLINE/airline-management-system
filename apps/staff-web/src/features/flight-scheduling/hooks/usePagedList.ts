import { useEffect, useRef, useState } from 'react'

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

// Takes a path under the API root, like AppAuthProvider's fetchWithAuth.
export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

export const BASE = '/api/flight-scheduling'

// "400 Bad Request. icao_code must be 4 letters" from a Nest error body ({ error, message: string | string[] }), else the HTTP status.
export async function errorMessage(res: Response) {
  try {
    const body = (await res.json()) as { error?: string; message?: string | string[] }
    if (body.message) return `${res.status} ${body.error ?? 'Error'}. ${[body.message].flat().join('; ')}`
  } catch {
    // body was not JSON
  }
  return `HTTP ${res.status}`
}

// GET a cursor-paged list from the flight-scheduling API; `loadMore` appends the next page and `reload` starts over.
// ponytail: local to this feature, no cache. Swap for TanStack Query once the Dev Leads add the shared setup.
export function usePagedList<T>(path: string, fetcher: Fetcher) {
  const fetchRef = useRef(fetcher)
  useEffect(() => {
    fetchRef.current = fetcher
  })

  const [state, setState] = useState<State<T> | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [version, setVersion] = useState(0)

  async function fetchPage(cursor: string | null): Promise<Page<T>> {
    const url = `${BASE}${path}${cursor ? `${path.includes('?') ? '&' : '?'}cursor=${cursor}` : ''}`
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
    // fetchPage only reads `path` and the ref; `version` is the reload trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version])

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
    reload: () => setVersion((v) => v + 1),
  }
}
