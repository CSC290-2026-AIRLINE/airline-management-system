/** The signature of `fetchWithAuth` from the shared `AuthProvider`. */
export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * The routes of this feature answer `{ error: { code, message, details? } }`; an error from the platform (a missing token, for
 * example) still answers Nest's `{ message: string | string[] }`, and a validation error there carries an array.
 */
async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const parsed = (await res.json()) as { error?: { message?: string }; message?: string | string[] }
    if (typeof parsed.error?.message === 'string') {
      return parsed.error.message
    }
    const body = parsed
    if (Array.isArray(body.message)) {
      return body.message.join(', ')
    }
    if (typeof body.message === 'string') {
      return body.message
    }
  } catch {
    // The body was not JSON, so there is nothing better than the status line.
  }
  return null
}

export async function requestJson<T>(fetcher: Fetcher, path: string, init?: RequestInit): Promise<T> {
  // A plain object, not a `Headers` instance: the shared `fetchWithAuth` spreads `init.headers`, and spreading a `Headers`
  // instance gives an empty object, which would drop the content type and leave the backend with an empty body.
  const headers: Record<string, string> = init?.body ? { 'Content-Type': 'application/json' } : {}

  const res = await fetcher(path, { ...init, headers })
  if (!res.ok) {
    const message = await readErrorMessage(res)
    throw new ApiError(message ?? `${res.status} ${res.statusText}`, res.status)
  }
  if (res.status === 204) {
    return undefined as T
  }
  // Nest answers an endpoint that returns `null` with an empty 200 body, which `res.json()` cannot parse.
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

/** Turns any thrown value into a message that can be shown to a staff member. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
