import type { ApiErrorBody, FlightSearchRequest, FlightSearchResponse } from './types'

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

async function readError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return new ApiError(body.error.code, body.error.message, response.status, body.error.details)
  } catch {
    return new ApiError('REQUEST_FAILED', response.statusText || 'Request failed', response.status)
  }
}

export function useBookingSearchApi() {
  // Search is public; AppAuthProvider only wraps authenticated routes.
  const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''

  async function searchFlights(input: FlightSearchRequest, signal?: AbortSignal): Promise<FlightSearchResponse> {
    const response = await fetch(`${apiUrl}/api/search/flights`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as FlightSearchResponse
  }

  return { searchFlights }
}
