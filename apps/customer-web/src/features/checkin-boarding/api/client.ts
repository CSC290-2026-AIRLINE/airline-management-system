import type { ApiError, BoardingPassView, CheckInView, SeatLock, SeatMap } from './types.ts'

export interface CheckInApi {
  start(input: { pnr: string; lastName: string }): Promise<CheckInView>
  get(id: string): Promise<CheckInView>
  submitDocument(id: string, input: { mrzLine1: string; mrzLine2: string; visaNumber?: string }): Promise<CheckInView>
  seatMap(flightId: string): Promise<SeatMap>
  holdSeat(flightId: string, input: { checkInId: string; seatCode: string }): Promise<SeatLock>
  releaseSeat(lockId: string): Promise<void>
  confirmSeat(id: string, input: { lockId: string }): Promise<CheckInView>
  declareBags(id: string, input: { declaredBags: number }): Promise<CheckInView>
  complete(id: string): Promise<BoardingPassView>
  boardingPass(id: string): Promise<BoardingPassView>
}

/** Every backend failure arrives as `{ error: { code, message, details? } }`; this carries it. */
export class ApiRequestError extends Error {
  readonly code: string
  readonly details: Record<string, unknown> | undefined
  readonly status: number

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function createHttpApi(fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>): CheckInApi {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(path, init)
    const payload = (await res.json().catch(() => null)) as ApiError | T | null
    if (!res.ok) {
      const envelope = (payload as ApiError | null)?.error
      throw new ApiRequestError(res.status, envelope?.code ?? 'UNKNOWN', envelope?.message ?? res.statusText, envelope?.details)
    }
    return payload as T
  }

  const put = (body: unknown): RequestInit => ({ method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body) })
  const post = (body?: unknown): RequestInit => ({
    method: 'POST',
    headers: JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  return {
    start: (input) => request<CheckInView>('/api/check-ins', post(input)),
    get: (id) => request<CheckInView>(`/api/check-ins/${id}`),
    submitDocument: (id, input) => request<CheckInView>(`/api/check-ins/${id}/document`, put(input)),
    seatMap: (flightId) => request<SeatMap>(`/api/flights/${flightId}/seat-map`),
    holdSeat: (flightId, input) => request<SeatLock>(`/api/flights/${flightId}/seat-locks`, post(input)),
    releaseSeat: async (lockId) => {
      await request<void>(`/api/seat-locks/${lockId}`, { method: 'DELETE' })
    },
    confirmSeat: (id, input) => request<CheckInView>(`/api/check-ins/${id}/seat`, put(input)),
    declareBags: (id, input) => request<CheckInView>(`/api/check-ins/${id}/baggage`, put(input)),
    complete: (id) => request<BoardingPassView>(`/api/check-ins/${id}/complete`, post()),
    boardingPass: (id) => request<BoardingPassView>(`/api/check-ins/${id}/boarding-pass`),
  }
}
