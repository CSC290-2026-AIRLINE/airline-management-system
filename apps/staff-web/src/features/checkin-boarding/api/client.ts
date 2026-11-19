// The staff contract: one interface, two clients (the real API and the browser mock).
import type {
  AddGatesResult,
  ApiError,
  AirportGateCount,
  BoardingPassView,
  CheckedBagView,
  FlightSummary,
  GateInfo,
  GateList,
  Headcount,
  ScanResult,
  SeatLock,
  SeatMap,
  StaffCheckInRow,
  StaffCheckInView,
} from './types.ts'

export interface BagInput {
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
}

export interface StaffSearchQuery {
  flightId?: string
  pnr?: string
  name?: string
}

export interface StaffApi {
  search(q: StaffSearchQuery): Promise<StaffCheckInRow[]>
  detail(id: string): Promise<StaffCheckInView>
  /** Starts the check-in of a booked passenger who has not started one online. */
  start(input: { bookingPassengerId: string; flightId: string }): Promise<StaffCheckInView>
  /** The passenger steps, done by the agent. Each one answers with the counter's view of the passenger. */
  submitDocument(id: string, input: { mrzLine1: string; mrzLine2: string; visaNumber?: string }): Promise<StaffCheckInView>
  seatMap(flightId: string): Promise<SeatMap>
  /** Holds the seat and confirms it; a paid seat is charged to the booking. */
  chooseSeat(id: string, flightId: string, seatCode: string): Promise<StaffCheckInView>
  complete(id: string): Promise<StaffCheckInView>
  weighBag(id: string, input: BagInput): Promise<StaffCheckInView>
  removeBag(bagId: string): Promise<StaffCheckInView>
  /** Charges every unpaid excess fee of the check-in; the tags come after. */
  payExcess(id: string): Promise<StaffCheckInView>
  tagBag(bagId: string): Promise<{ bag: CheckedBagView; view: StaffCheckInView }>
  carryOn(id: string, input: BagInput): Promise<StaffCheckInView>
  clearMismatch(documentId: string): Promise<StaffCheckInView>
  checkVisa(documentId: string): Promise<StaffCheckInView>
  printPass(passId: string): Promise<BoardingPassView>
  gates(airportCode: string, opts?: { all?: boolean }): Promise<GateInfo[]>
  gateCounts(): Promise<AirportGateCount[]>
  addGates(airportCode: string, codes: string[]): Promise<AddGatesResult>
  setGateActive(gateId: string, isActive: boolean): Promise<GateInfo>
  flights(): Promise<FlightSummary[]>
  setGate(flightId: string, input: { gateId: string }): Promise<FlightSummary>
  passengerList(gateId: string, flightId: string): Promise<GateList>
  scan(gateId: string, input: { flightId: string; reference: string }): Promise<ScanResult>
  headcount(flightId: string): Promise<Headcount>
  setHeadcount(flightId: string, input: { source: 'sensor' } | { source: 'manual'; count: number }): Promise<Headcount>
  closeGate(flightId: string, input: { confirmMismatch?: boolean }): Promise<Headcount>
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown> | undefined

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** Talks to the real backend: every path is under the global /api prefix. */
export function createHttpStaffApi(fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>): StaffApi {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(path, { headers: { 'Content-Type': 'application/json' }, ...init })
    const body: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const err = (body as ApiError | null)?.error
      throw new ApiRequestError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? res.statusText, err?.details)
    }
    return body as T
  }

  const post = (body?: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body ?? {}) })
  const put = (body: unknown): RequestInit => ({ method: 'PUT', body: JSON.stringify(body) })
  const patch = (body: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(body) })

  const detail = (id: string) => request<StaffCheckInView>(`/api/staff/check-ins/${id}`)

  return {
    search: (q) => {
      const params = new URLSearchParams()
      if (q.flightId) params.set('flightId', q.flightId)
      if (q.pnr) params.set('pnr', q.pnr)
      if (q.name) params.set('name', q.name)
      const query = params.toString()
      return request<StaffCheckInRow[]>(`/api/staff/check-ins${query ? `?${query}` : ''}`)
    },
    detail,
    start: (input) => request<StaffCheckInView>('/api/staff/check-ins', post(input)),
    // The passenger routes answer with the passenger's view; the counter reads its own view after each step.
    submitDocument: async (id, input) => {
      await request(`/api/check-ins/${id}/document`, put(input))
      return detail(id)
    },
    seatMap: (flightId) => request<SeatMap>(`/api/flights/${flightId}/seat-map`),
    chooseSeat: async (id, flightId, seatCode) => {
      const lock = await request<SeatLock>(`/api/flights/${flightId}/seat-locks`, post({ checkInId: id, seatCode }))
      await request(`/api/check-ins/${id}/seat`, put({ lockId: lock.id }))
      return detail(id)
    },
    complete: async (id) => {
      await request(`/api/check-ins/${id}/complete`, post())
      return detail(id)
    },
    weighBag: (id, input) => request<StaffCheckInView>(`/api/staff/check-ins/${id}/bags`, post(input)),
    removeBag: (bagId) => request<StaffCheckInView>(`/api/staff/bags/${bagId}`, { method: 'DELETE' }),
    payExcess: (id) => request<StaffCheckInView>(`/api/staff/check-ins/${id}/bags/pay`, post()),
    tagBag: (bagId) => request<{ bag: CheckedBagView; view: StaffCheckInView }>(`/api/staff/bags/${bagId}/tag`, post()),
    carryOn: (id, input) => request<StaffCheckInView>(`/api/staff/check-ins/${id}/carry-on`, put(input)),
    clearMismatch: (documentId) => request<StaffCheckInView>(`/api/staff/travel-documents/${documentId}/clear-mismatch`, post()),
    checkVisa: (documentId) => request<StaffCheckInView>(`/api/staff/travel-documents/${documentId}/check-visa`, post()),
    printPass: (passId) => request<BoardingPassView>(`/api/staff/boarding-passes/${passId}/print`, post()),
    gates: (airportCode, opts) => {
      const params = new URLSearchParams({ airport: airportCode })
      if (opts?.all) params.set('all', 'true')
      return request<GateInfo[]>(`/api/staff/gates?${params.toString()}`)
    },
    gateCounts: () => request<AirportGateCount[]>('/api/staff/gates/counts'),
    addGates: (airportCode, codes) => request<AddGatesResult>(`/api/staff/airports/${airportCode}/gates`, post({ codes })),
    setGateActive: (gateId, isActive) => request<GateInfo>(`/api/staff/gates/${gateId}`, patch({ isActive })),
    flights: () => request<FlightSummary[]>('/api/staff/flights'),
    setGate: (flightId, input) => request<FlightSummary>(`/api/staff/flights/${flightId}/gate`, put(input)),
    passengerList: (gateId, flightId) => request<GateList>(`/api/staff/gates/${gateId}/flights/${flightId}/passengers`),
    scan: (gateId, input) => request<ScanResult>(`/api/staff/gates/${gateId}/scans`, post(input)),
    headcount: (flightId) => request<Headcount>(`/api/staff/flights/${flightId}/headcount`),
    setHeadcount: (flightId, input) => request<Headcount>(`/api/staff/flights/${flightId}/headcount`, put(input)),
    closeGate: (flightId, input) => request<Headcount>(`/api/staff/flights/${flightId}/close-gate`, post(input)),
  }
}
