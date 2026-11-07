import { useAppAuth } from '@customer-web/auth/AuthProvider'
import type { ApiErrorBody, BookingDetail, CancelPreview, HoldBookingRequest, HoldBookingResponse } from './types'

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

export function useBookingPnrApi() {
  const { fetchWithAuth } = useAppAuth()

  async function getBooking(reference: string): Promise<BookingDetail> {
    const response = await fetchWithAuth(`/api/bookings/${encodeURIComponent(reference)}`)
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as BookingDetail
  }

  async function holdBooking(input: HoldBookingRequest, idempotencyKey: string): Promise<HoldBookingResponse> {
    const response = await fetchWithAuth('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as HoldBookingResponse
  }

  async function getCancelPreview(reference: string): Promise<CancelPreview> {
    const response = await fetchWithAuth(`/api/bookings/${encodeURIComponent(reference)}/cancellation-preview`)
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as CancelPreview
  }

  async function cancelBooking(reference: string): Promise<void> {
    const response = await fetchWithAuth(`/api/bookings/${encodeURIComponent(reference)}/cancel`, { method: 'POST' })
    if (!response.ok) {
      throw await readError(response)
    }
  }

  return { getBooking, holdBooking, getCancelPreview, cancelBooking }
}
