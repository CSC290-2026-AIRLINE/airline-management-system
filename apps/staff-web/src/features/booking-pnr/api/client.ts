import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type {
  ApiErrorBody,
  BookForCustomerRequest,
  BookingDetail,
  BookingServiceRequest,
  HoldBookingResponse,
  ServiceRequestListQuery,
  ServiceRequestQueueItem,
  ServiceRequestUpdate,
  StaffBookingPage,
  StaffBookingQuery,
  StaffCancelRequest,
  CancelPreview,
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

function toQueryString(query: object): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if ((typeof value === 'string' || typeof value === 'number') && value !== '') {
      params.set(key, String(value))
    }
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function useBookingPnrApi() {
  const { fetchWithAuth } = useAppAuth()

  async function searchBookings(query: StaffBookingQuery): Promise<StaffBookingPage> {
    const response = await fetchWithAuth(`/api/staff/bookings${toQueryString(query)}`)
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as StaffBookingPage
  }

  async function getBooking(reference: string): Promise<BookingDetail> {
    const response = await fetchWithAuth(`/api/bookings/${encodeURIComponent(reference)}`)
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as BookingDetail
  }

  async function getStaffBooking(reference: string): Promise<BookingDetail> {
    const response = await fetchWithAuth(`/api/staff/bookings/${encodeURIComponent(reference)}`)
    if (!response.ok) throw await readError(response)
    return (await response.json()) as BookingDetail
  }

  async function getStaffCancelPreview(reference: string): Promise<CancelPreview> {
    const response = await fetchWithAuth(`/api/staff/bookings/${encodeURIComponent(reference)}/cancellation-preview`)
    if (!response.ok) throw await readError(response)
    return (await response.json()) as CancelPreview
  }

  async function cancelStaffBooking(reference: string, input: StaffCancelRequest): Promise<void> {
    const response = await fetchWithAuth(`/api/staff/bookings/${encodeURIComponent(reference)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) throw await readError(response)
  }
  async function bookForCustomer(input: BookForCustomerRequest, idempotencyKey: string): Promise<HoldBookingResponse> {
    const response = await fetchWithAuth('/api/staff/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as HoldBookingResponse
  }

  async function listServiceRequests(query: ServiceRequestListQuery): Promise<ServiceRequestQueueItem[]> {
    const response = await fetchWithAuth(`/api/staff/service-requests${toQueryString(query)}`)
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as ServiceRequestQueueItem[]
  }

  async function updateServiceRequest(id: string, input: ServiceRequestUpdate): Promise<BookingServiceRequest> {
    const response = await fetchWithAuth(`/api/staff/service-requests/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      throw await readError(response)
    }
    return (await response.json()) as BookingServiceRequest
  }

  return {
    searchBookings,
    getBooking,
    getStaffBooking,
    getStaffCancelPreview,
    cancelStaffBooking,
    bookForCustomer,
    listServiceRequests,
    updateServiceRequest,
  }
}
