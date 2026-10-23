import { useEffect, useRef, useState } from 'react'
import { BASE, errorMessage, type Fetcher } from './usePagedList'

interface State<T> {
  path: string
  data: T | null
  error: string | null
}

// GET one resource from the flight-scheduling API. Pass null to wait (for example until an id is known); `reload` fetches it again.
// ponytail: local to this feature, no cache. Swap for TanStack Query once the Dev Leads add the shared setup.
export function useResource<T>(path: string | null, fetcher: Fetcher) {
  const fetchRef = useRef(fetcher)
  useEffect(() => {
    fetchRef.current = fetcher
  })
  const [state, setState] = useState<State<T> | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (path === null) return
    let stale = false
    fetchRef
      .current(`${BASE}${path}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await errorMessage(res))
        return (await res.json()) as T
      })
      .then((data) => !stale && setState({ path, data, error: null }))
      .catch((e: unknown) => !stale && setState({ path, data: null, error: e instanceof Error ? e.message : String(e) }))
    return () => {
      stale = true
    }
  }, [path, version])

  const current = path !== null && state?.path === path ? state : null
  return {
    loading: path !== null && current === null,
    data: current?.data ?? null,
    error: current?.error ?? null,
    reload: () => setVersion((v) => v + 1),
  }
}
