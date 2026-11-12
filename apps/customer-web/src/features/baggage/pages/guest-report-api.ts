import {
  parseGuestReportResult,
  usableGuestFlights,
  usableGuestTravellers,
  type EligibleFlight,
  type EligibleTraveller,
  type GuestReportResult,
} from './lost-report-form.ts'

/** The public guest endpoints (no sign-in). */
export const GUEST_REPORT_PATHS = {
  flights: '/api/guest/lost-report-flights',
  travellers: '/api/guest/lost-report-travellers',
  reports: '/api/guest/lost-reports',
} as const

export interface GuestApiOptions {
  baseUrl: string
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>
}

/** The same API base the app uses everywhere (VITE_API_URL). */
export function defaultGuestApiOptions(): GuestApiOptions {
  return { baseUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080' }
}

export type GuestLookupResult = { ok: true; flights: EligibleFlight[]; travellers: EligibleTraveller[] } | { ok: false; message: string }

export type GuestSubmitResult = { ok: true; result: GuestReportResult } | { ok: false; message: string }

const NETWORK_ERROR = 'We could not reach the server. Check your connection and try again.'
const LOOKUP_NOT_FOUND = 'We could not find an eligible booking with that booking reference and surname.'
const SUBMIT_NOT_VERIFIED = 'We could not verify the booking, traveller and flight. Find your booking again, then retry.'

/**
 * Guest requests never carry the signed-in session: no Authorization header and no cookies (credentials: 'omit').
 * Booking details go in the request body, never in the URL.
 */
function guestRequest(options: GuestApiOptions, path: string, init: RequestInit): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? ((input: string, requestInit: RequestInit) => fetch(input, requestInit))
  return fetchImpl(`${options.baseUrl}${path}`, { ...init, method: 'POST', credentials: 'omit' })
}

function jsonRequest(options: GuestApiOptions, path: string, body: unknown): Promise<Response> {
  return guestRequest(options, path, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

/** A user-facing message for a failed guest response. Booking verification failures stay deliberately generic. */
export async function guestErrorMessage(response: Response, stage: 'lookup' | 'submit', fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { code?: unknown; message?: unknown } | null
  if (body?.code === 'INVALID_REPORT' && body.message === 'Booking verification failed') {
    return stage === 'lookup' ? LOOKUP_NOT_FOUND : SUBMIT_NOT_VERIFIED
  }
  if (Array.isArray(body?.message)) return body.message.filter((part) => typeof part === 'string').join(' ') || fallback
  if (typeof body?.message === 'string' && body.message) return body.message
  return fallback
}

/** Finds the booking: its eligible flights and "Whose bag is it?" travellers (each with their own flights). */
export async function lookUpGuestBooking(
  access: { bookingReference: string; surname: string },
  options: GuestApiOptions,
): Promise<GuestLookupResult> {
  const body = { bookingReference: access.bookingReference, surname: access.surname }
  const fallback = 'Eligible flights could not be loaded. Try again.'
  try {
    const [flightsResponse, travellersResponse] = await Promise.all([
      jsonRequest(options, GUEST_REPORT_PATHS.flights, body),
      jsonRequest(options, GUEST_REPORT_PATHS.travellers, body),
    ])
    if (!flightsResponse.ok) return { ok: false, message: await guestErrorMessage(flightsResponse, 'lookup', fallback) }
    if (!travellersResponse.ok) return { ok: false, message: await guestErrorMessage(travellersResponse, 'lookup', fallback) }

    const flights = usableGuestFlights(await flightsResponse.json())
    const travellers = usableGuestTravellers(await travellersResponse.json())
    if (flights.length === 0 || travellers.length === 0) return { ok: false, message: LOOKUP_NOT_FOUND }
    return { ok: true, flights, travellers }
  } catch {
    return { ok: false, message: NETWORK_ERROR }
  }
}

/** Sends the guest report. No Content-Type is set, so the runtime adds the multipart boundary. */
export async function submitGuestLostReport(formData: FormData, options: GuestApiOptions): Promise<GuestSubmitResult> {
  const fallback = 'Your report could not be sent. Check the details and try again.'
  let response: Response
  try {
    response = await guestRequest(options, GUEST_REPORT_PATHS.reports, { body: formData })
  } catch {
    return { ok: false, message: NETWORK_ERROR }
  }
  if (!response.ok) return { ok: false, message: await guestErrorMessage(response, 'submit', fallback) }

  const result = parseGuestReportResult(await response.json().catch(() => null))
  if (!result) {
    return {
      ok: false,
      message:
        'The report may have been created, but the confirmation was incomplete. Please contact airline staff with your booking reference before reporting again.',
    }
  }
  return { ok: true, result }
}
