import { useAppAuth } from '@staff-web/auth/AuthProvider'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

/**
 * Build a single auth-wrapped fetch for the current render. `fetchWithAuth` from AuthProvider is not memoised, so
 * recreating the wrapper is the safe pattern — never put it in a `useEffect` dependency array.
 */
export function useFetchJson() {
  const { fetchWithAuth } = useAppAuth()
  return async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(`${API_URL}${path}`, {
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

export { API_URL }
