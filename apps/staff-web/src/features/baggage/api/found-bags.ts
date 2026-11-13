import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type { BagColour, BagType, FoundBagStatus, StaffMoveAction } from '../constants'

/** Same shape as the backend's `FoundBag` (`apps/backend/src/modules/baggage/common/found-bag.types.ts`), dates as ISO strings. */
export interface FoundBag {
  id: string
  checkedBagId: string | null
  tagNumber: string | null
  flightId: string | null
  bagType: BagType | null
  colour: BagColour | null
  brand: string | null
  description: string | null
  foundAirport: string
  foundAt: string
  source: 'staff' | 'diverted_flight'
  status: FoundBagStatus
  recordedBy: string | null
  createdAt: string
  updatedAt: string
}

/** A row of `GET /api/staff/found-bags`: the bag and the airport it is at now. */
export interface FoundBagListItem extends FoundBag {
  /** Airport of the latest location event, or the found airport. A bag in transit counts where it was sent from. */
  nowAt: string
}

export type BagLocationAction = 'found' | 'held' | 'sent' | 'arrived' | 'at_diverted_airport' | 'out_for_delivery' | 'delivered'

export interface BagLocationEvent {
  id: string
  foundBagId: string
  airportCode: string
  action: BagLocationAction
  toAirport: string | null
  sentOnFlightId: string | null
  note: string | null
  staffId: string | null
  occurredAt: string
  createdAt: string
}

export interface BagTrackingHistory {
  foundBagId: string
  current: {
    airportCode: string
    inTransit: boolean
    toAirport: string | null
    lastAction: BagLocationAction
    lastEventAt: string
  } | null
  events: BagLocationEvent[]
}

/** Same shape as the backend's `StationContact` (`station-contact.service.ts`). */
export interface StationContact {
  airportCode: string
  airportName: string
  city: string
  deskName: string
  phone: string
  email: string | null
  updatedAt: string
  updatedBy: string | null
}

export interface SaveStationContactBody {
  deskName: string
  phone: string
  email?: string
}

export interface RecordFoundBagBody {
  foundAirport: string
  bagType: BagType
  colour: BagColour
  tagNumber?: string
  /** The flight the bag came off, from `flightsInto`. Left out when nobody knows. */
  flightId?: string
  brand?: string
  description?: string
}

export interface RecordMoveBody {
  action: StaffMoveAction
  toAirport?: string
  /** Only with `sent`: the flight the bag goes on, from `departures`. */
  sentOnFlightId?: string
  note?: string
}

export interface CompleteDetailsBody {
  bagType: BagType
  colour: BagColour
}

/** Same shape as the backend's `BaggageFlight` (`baggage-flight.service.ts`), dates as ISO strings. */
export interface BaggageFlight {
  id: string
  flightNumber: string
  serviceDate: string
  origin: string
  /** Where the flight landed: the diversion airport when it was diverted. */
  destination: string
  arrivedAt: string
  departsAt: string
}

/** An airport from Feature 2's airport table (backend `BaggageAirport`). */
export interface BaggageAirport {
  code: string
  name: string
  city: string
}

/** What `POST /api/staff/found-bags/diversions/:flightId` answers. */
export interface DiversionResult {
  flightId: string
  divertedTo: string
  created: FoundBag[]
  /** Bags in the hold that already had a found bag row. */
  skipped: number
}

/** `GET /api/staff/baggage-desk`: the simulation time and the signed-in role. */
export interface BaggageDesk {
  now: string
  roleCode: string
  roleName: string
}

/** Shown while the backend cannot be reached (not started yet, restarting, or the network is down). */
export const SERVER_UNREACHABLE_MESSAGE = "Can't reach the baggage server. Trying again…"

/** Any non-2xx answer from `/api/staff/*`, or status 0 when no answer came. The baggage endpoints answer `{ code, message }`. */
export class BaggageApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'BaggageApiError'
    this.status = status
    this.code = code
  }
}

async function readError(res: Response): Promise<BaggageApiError> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // Not JSON: fall back to the status line.
  }
  const flat = body as { code?: unknown; message?: unknown; error?: { code?: string; message?: string } } | null
  const code = typeof flat?.code === 'string' ? flat.code : (flat?.error?.code ?? `HTTP_${res.status}`)
  const rawMessage = typeof flat?.message === 'string' ? flat.message : flat?.error?.message
  return new BaggageApiError(res.status, code, rawMessage || res.statusText || 'Request failed')
}

/**
 * Sends a JSON request to a staff baggage endpoint and reads the answer, or throws a `BaggageApiError` (status 0 when
 * the server could not be reached). A 204 answer resolves to `undefined`.
 */
export function useBaggageSend() {
  const { fetchWithAuth } = useAppAuth()

  return async function send<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetchWithAuth(path, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      })
    } catch (e: unknown) {
      // fetch rejects with a TypeError ("Failed to fetch") when no answer comes back at all.
      if (e instanceof TypeError) throw new BaggageApiError(0, 'SERVER_UNREACHABLE', SERVER_UNREACHABLE_MESSAGE)
      throw e
    }
    if (!res.ok) throw await readError(res)
    return (res.status === 204 ? undefined : await res.json()) as T
  }
}

/**
 * Staff baggage endpoints. The functions close over `fetchWithAuth`, which is recreated every render, so call them from
 * event handlers or a mount effect and never list them as effect dependencies.
 */
export function useFoundBagApi() {
  const send = useBaggageSend()

  return {
    list: (status?: FoundBagStatus) => send<FoundBagListItem[]>(`/api/staff/found-bags${status ? `?status=${status}` : ''}`),
    get: (id: string) => send<FoundBag>(`/api/staff/found-bags/${id}`),
    record: (body: RecordFoundBagBody) => send<FoundBag>('/api/staff/found-bags', { method: 'POST', body: JSON.stringify(body) }),
    history: (id: string) => send<BagTrackingHistory>(`/api/staff/found-bags/${id}/locations`),
    recordMove: (id: string, body: RecordMoveBody) =>
      send<BagTrackingHistory>(`/api/staff/found-bags/${id}/locations`, { method: 'POST', body: JSON.stringify(body) }),
    completeDetails: (id: string, body: CompleteDetailsBody) =>
      send<FoundBag>(`/api/staff/found-bags/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    continueWithFlight: (id: string) => send<FoundBag>(`/api/staff/found-bags/${id}/continue-with-flight`, { method: 'POST' }),
    flightsInto: (airportCode: string) => send<BaggageFlight[]>(`/api/staff/baggage-flights?airport=${encodeURIComponent(airportCode)}`),
    departures: (from: string, to: string) =>
      send<BaggageFlight[]>(`/api/staff/baggage-flights/departures?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    flight: (id: string) => send<BaggageFlight>(`/api/staff/baggage-flights/${id}`),
    divertedFlights: () => send<BaggageFlight[]>('/api/staff/baggage-flights/diverted'),
    recordDiversion: (flightId: string) => send<DiversionResult>(`/api/staff/found-bags/diversions/${flightId}`, { method: 'POST' }),
    airports: () => send<BaggageAirport[]>('/api/staff/baggage-flights/airports'),
    desk: () => send<BaggageDesk>('/api/staff/baggage-desk'),
    stations: () => send<StationContact[]>('/api/staff/station-contacts'),
    saveStation: (airportCode: string, body: SaveStationContactBody) =>
      send<StationContact>(`/api/staff/station-contacts/${encodeURIComponent(airportCode)}`, { method: 'PUT', body: JSON.stringify(body) }),
  }
}
