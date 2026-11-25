// Central HTTP client for the F12 staff-web wiring. All API calls go
// through this so the spec's `{ error: { code, message, details? } }`
// envelope is parsed in one place. Throws `ApiError` for non-2xx
// responses (with the spec code) so call sites can `instanceof` and
// surface friendly messages without re-parsing JSON.

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: Record<string, unknown> | undefined
  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: Record<string, unknown> }
}

export class ApiClient {
  private readonly fetchWithAuth: ApiFetch
  constructor(fetchWithAuth: ApiFetch) {
    this.fetchWithAuth = fetchWithAuth
  }

  async get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>('GET', path, undefined, query)
  }

  async post<T>(path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>('POST', path, body, query)
  }

  async put<T>(path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>('PUT', path, body, query)
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    if (!query) return path
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      params.set(k, String(v))
    }
    const qs = params.toString()
    return qs ? `${path}?${qs}` : path
  }

  private async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<T> {
    const url = this.buildUrl(path, query)
    let res: Response
    try {
      res = await this.fetchWithAuth(url, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (e) {
      throw new NetworkError(e instanceof Error ? e.message : 'Network error')
    }
    if (res.status === 204) {
      return undefined as T
    }
    const text = await res.text()
    const json = text ? (JSON.parse(text) as unknown) : undefined
    if (!res.ok) {
      const envelope = (json as ErrorBody | undefined)?.error
      const code = envelope?.code ?? `HTTP_${res.status}`
      const message = envelope?.message ?? res.statusText ?? 'Request failed.'
      throw new ApiError(code, message, res.status, envelope?.details)
    }
    return json as T
  }
}
