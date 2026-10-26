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

/** Nest answers with `{ message: string | string[] }`; validation errors carry an array. */
async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { message?: string | string[] }
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
  const headers = new Headers(init?.headers)
  if (init?.body) {
    headers.set('Content-Type', 'application/json')
  }

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
