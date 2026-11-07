import { useAppAuth } from '@customer-web/auth/AuthProvider'
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
  const { fetchWithAuth } = useAppAuth()

  async function searchFlights(input: FlightSearchRequest): Promise<FlightSearchResponse> {
    const response = await fetchWithAuth('/api/search/flights', {
      method: 'POST',
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
