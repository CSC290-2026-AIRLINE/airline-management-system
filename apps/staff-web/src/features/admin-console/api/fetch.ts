import { useAppAuth } from '@staff-web/auth/AuthProvider'

/** The `error` object of a `{ error: { code, message } }` body, or `null` when the body is not that (or not JSON). */
function parseErrorBody(body: string): { code?: unknown; message?: unknown } | null {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown; message?: unknown } } | null
    return parsed && typeof parsed.error === 'object' ? parsed.error : null
  } catch {
    return null
  }
}

/**
 * Thrown by `fetchJson` for any non-2xx answer. `message` keeps the old `401 Unauthorized: {…}` form, which the pages
 * read the status from; `code` and `serverMessage` come from the `{ error: { code, message } }` body every admin
 * endpoint sends, so a page can react to `ROLE_NOT_FOUND` or show the server's sentence instead of raw JSON.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly serverMessage: string | null

  constructor(status: number, statusText: string, body: string) {
    super(`${status} ${statusText}${body ? `: ${body}` : ''}`)
    this.name = 'ApiError'
    this.status = status
    const err = parseErrorBody(body)
    this.code = typeof err?.code === 'string' ? err.code : null
    this.serverMessage = typeof err?.message === 'string' ? err.message : null
  }
}

/** The sentence to show for a failed request: the server's own message when it sent one. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.serverMessage ?? e.message
  return e instanceof Error ? e.message : String(e)
}

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
      throw new ApiError(res.status, res.statusText, body)
    }
    return (await res.json()) as T
  }
}
