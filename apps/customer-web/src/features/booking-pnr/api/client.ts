import { useAppAuth } from '@customer-web/auth/AuthProvider'
import type {
  ApiErrorBody,
  BookingContact,
  BookingDetail,
  CancelBookingResult,
  CancelPreview,
  ConfirmBookingResult,
  CustomerTrips,
  HoldBookingRequest,
  HoldBookingResponse,
  ServiceCode,
  InsuranceOffer,
} from './types'

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

  async function devConfirmBooking(reference: string, options: { addInsurance?: boolean } = {}): Promise<ConfirmBookingResult> {
    const response = await fetchWithAuth(`/api/dev/bookings/${encodeURIComponent(reference)}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addInsurance: options.addInsurance === true }),
    })
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as ConfirmBookingResult
  }

  /** What the booker's loyalty tier offers for travel insurance on this booking. */
  async function getInsuranceOffer(reference: string): Promise<InsuranceOffer> {
    const response = await fetchWithAuth(`/api/bookings/${encodeURIComponent(reference)}/insurance`)
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as InsuranceOffer
  }

  async function getCancelPreview(reference: string): Promise<CancelPreview> {
    const response = await fetchWithAuth(`/api/bookings/${encodeURIComponent(reference)}/cancellation-preview`)
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as CancelPreview
  }

  async function cancelBooking(reference: string): Promise<CancelBookingResult> {
    const response = await fetchWithAuth(`/api/bookings/${encodeURIComponent(reference)}/cancel`, { method: 'POST' })
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as CancelBookingResult
  }

  async function getCustomerTrips(): Promise<CustomerTrips> {
    const response = await fetchWithAuth('/api/customers/me/bookings')
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as CustomerTrips
  }

  /** The contact details of a booking that is still on hold. */
  async function updateContact(reference: string, input: { contactEmail: string; contactPhone?: string }): Promise<BookingContact> {
    const response = await fetchWithAuth(`/api/bookings/${encodeURIComponent(reference)}/contact`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as BookingContact
  }

  /** A special-assistance request for a passenger of a booking that is still on hold. */
  async function createServiceRequest(
    reference: string,
    input: { bookingPassengerId: string; bookingSegmentId?: string | null; serviceCode: ServiceCode; note?: string | null },
  ): Promise<void> {
    const response = await fetchWithAuth(`/api/bookings/${encodeURIComponent(reference)}/service-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      throw await readError(response)
    }
  }

  return {
    getBooking,
    holdBooking,
    devConfirmBooking,
    getInsuranceOffer,
    getCancelPreview,
    cancelBooking,
    getCustomerTrips,
    updateContact,
    createServiceRequest,
  }
}
