import { useAppAuth } from '@staff-web/auth/AuthProvider'

/**
 * Build a single auth-wrapped fetch for the current render. `fetchWithAuth` from AuthProvider is not memoised, so
 * recreating the wrapper is the safe pattern — never put it in a `useEffect` dependency array.
 *
 * `fetchWithAuth` already prefixes `API_URL` itself (see AuthProvider), so `path` is passed through unchanged —
 * prepending it here would produce `http://localhost:8080http://localhost:8080/api/admin/screens`.
 */
export function useFetchJson() {
  const { fetchWithAuth } = useAppAuth()
  return async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ''}`)
    }
    return (await res.json()) as T
  }
}
