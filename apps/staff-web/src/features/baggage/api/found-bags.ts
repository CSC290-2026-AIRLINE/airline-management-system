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
  brand?: string
  description?: string
}

export interface RecordMoveBody {
  action: StaffMoveAction
  toAirport?: string
  note?: string
}

export interface CompleteDetailsBody {
  bagType: BagType
  colour: BagColour
}

/** Any non-2xx answer from `/api/staff/*`. The baggage endpoints answer `{ code, message }`. */
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
 * Sends a JSON request to a staff baggage endpoint and reads the answer, or throws a `BaggageApiError`. A 204 answer
 * resolves to `undefined`.
 */
export function useBaggageSend() {
  const { fetchWithAuth } = useAppAuth()

  return async function send<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
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
    list: (status?: FoundBagStatus) => send<FoundBag[]>(`/api/staff/found-bags${status ? `?status=${status}` : ''}`),
    get: (id: string) => send<FoundBag>(`/api/staff/found-bags/${id}`),
    record: (body: RecordFoundBagBody) => send<FoundBag>('/api/staff/found-bags', { method: 'POST', body: JSON.stringify(body) }),
    history: (id: string) => send<BagTrackingHistory>(`/api/staff/found-bags/${id}/locations`),
    recordMove: (id: string, body: RecordMoveBody) =>
      send<BagTrackingHistory>(`/api/staff/found-bags/${id}/locations`, { method: 'POST', body: JSON.stringify(body) }),
    completeDetails: (id: string, body: CompleteDetailsBody) =>
      send<FoundBag>(`/api/staff/found-bags/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    continueWithFlight: (id: string) => send<FoundBag>(`/api/staff/found-bags/${id}/continue-with-flight`, { method: 'POST' }),
    stations: () => send<StationContact[]>('/api/staff/station-contacts'),
    saveStation: (airportCode: string, body: SaveStationContactBody) =>
      send<StationContact>(`/api/staff/station-contacts/${encodeURIComponent(airportCode)}`, { method: 'PUT', body: JSON.stringify(body) }),
  }
}
