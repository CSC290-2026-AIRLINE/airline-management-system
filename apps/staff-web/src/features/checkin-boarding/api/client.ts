// The staff contract: one interface, two clients (the real API and the browser mock).
import type {
  ApiError,
  BoardingPassView,
  CheckedBagView,
  FlightSummary,
  GateInfo,
  GateList,
  Headcount,
  ScanResult,
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
  weighBag(id: string, input: BagInput): Promise<StaffCheckInView>
  removeBag(bagId: string): Promise<StaffCheckInView>
  tagBag(bagId: string): Promise<{ bag: CheckedBagView; view: StaffCheckInView }>
  carryOn(id: string, input: BagInput): Promise<StaffCheckInView>
  clearMismatch(documentId: string): Promise<StaffCheckInView>
  checkVisa(documentId: string): Promise<StaffCheckInView>
  printPass(passId: string): Promise<BoardingPassView>
  gates(): Promise<GateInfo[]>
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

  return {
    search: (q) => {
      const params = new URLSearchParams()
      if (q.flightId) params.set('flightId', q.flightId)
      if (q.pnr) params.set('pnr', q.pnr)
      if (q.name) params.set('name', q.name)
      const query = params.toString()
      return request<StaffCheckInRow[]>(`/api/staff/check-ins${query ? `?${query}` : ''}`)
    },
    detail: (id) => request<StaffCheckInView>(`/api/staff/check-ins/${id}`),
    weighBag: (id, input) => request<StaffCheckInView>(`/api/staff/check-ins/${id}/bags`, post(input)),
    removeBag: (bagId) => request<StaffCheckInView>(`/api/staff/bags/${bagId}`, { method: 'DELETE' }),
    tagBag: (bagId) => request<{ bag: CheckedBagView; view: StaffCheckInView }>(`/api/staff/bags/${bagId}/tag`, post()),
    carryOn: (id, input) => request<StaffCheckInView>(`/api/staff/check-ins/${id}/carry-on`, put(input)),
    clearMismatch: (documentId) => request<StaffCheckInView>(`/api/staff/travel-documents/${documentId}/clear-mismatch`, post()),
    checkVisa: (documentId) => request<StaffCheckInView>(`/api/staff/travel-documents/${documentId}/check-visa`, post()),
    printPass: (passId) => request<BoardingPassView>(`/api/staff/boarding-passes/${passId}/print`, post()),
    gates: () => request<GateInfo[]>('/api/staff/gates'),
    flights: () => request<FlightSummary[]>('/api/staff/flights'),
    setGate: (flightId, input) => request<FlightSummary>(`/api/staff/flights/${flightId}/gate`, put(input)),
    passengerList: (gateId, flightId) => request<GateList>(`/api/staff/gates/${gateId}/flights/${flightId}/passengers`),
    scan: (gateId, input) => request<ScanResult>(`/api/staff/gates/${gateId}/scans`, post(input)),
    headcount: (flightId) => request<Headcount>(`/api/staff/flights/${flightId}/headcount`),
    setHeadcount: (flightId, input) => request<Headcount>(`/api/staff/flights/${flightId}/headcount`, put(input)),
    closeGate: (flightId, input) => request<Headcount>(`/api/staff/flights/${flightId}/close-gate`, post(input)),
  }
}
