import type { BuildPairingParams, FlightLeg, LocalDate, Pairing, RosterRun, ScheduledFlight } from './types'

/**
 * Calls to `/api/crew-rostering/build-pairing`.
 *
 * Takes `fetchWithAuth` from `useAppAuth()` rather than calling `fetch`, so every
 * request carries the staff access token and is retried once after a refresh.
 * There is no cache here on purpose: TanStack Query is planned for staff-web, and
 * until it lands the page hook owns its own state.
 */

export type FetchWithAuth = (path: string, init?: RequestInit) => Promise<Response>

const BASE_PATH = '/api/crew-rostering/build-pairing'

/** A pairing as the backend sends it. The deleted-card fields are page state, not server state. */
type PairingPayload = Omit<Pairing, 'deleted' | 'releasedFlightIds' | 'releasedFlightNumbers'> & { rosterRunId: string | null }

interface PairingListPayload {
  pairings: PairingPayload[]
  flights: ScheduledFlight[]
  rosterRun: RosterRun | null
}

export interface PairingList {
  pairings: Pairing[]
  flights: ScheduledFlight[]
  rosterRun: RosterRun | null
}

export interface SaveLegsResult {
  pairing: Pairing
  withdrawnFromRun: boolean
}

export interface DeletePairingResult {
  id: string
  code: string
  releasedFlightIds: string[]
  releasedFlightNumbers: string[]
}

/** A pairing in the window that was committed earlier, so Generate does not offer its flights again. */
export interface CommittedPairing {
  code: string
  rosterRunId: string
  runDateFrom: LocalDate
  runDateTo: LocalDate
  runStatus: 'draft' | 'published'
}

/** What Generate answers: a proposal that is not stored yet, and what was already committed. */
export interface GenerateResult extends PairingList {
  committed: CommittedPairing[]
}

/** A pairing sent to be stored. `ref` is the code the proposal showed, so the answer can name it. */
export interface CommitDraft {
  ref: string
  legs: { flightId: string; addedManually: boolean }[]
}

export interface CommitResult {
  rosterRun: RosterRun
  /** The pairings that were stored, with the code each one was given. */
  committed: { ref: string; code: string }[]
  /** Refs of drafts that failed a legality check on the server. */
  skippedInvalid: string[]
  skippedOutsideWindow: string[]
  /** Refs of drafts with a flight somebody else had already paired. */
  skippedTaken: string[]
}

/** The backend's error message, so a 409 like `PAIRING_IN_USE` reaches the operator verbatim. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** JSON request to the API; a non-2xx answer becomes an `ApiError` carrying the backend's message. */
export async function requestJson<T>(fetchWithAuth: FetchWithAuth, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(path, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null
    const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message
    throw new ApiError(message ?? `Request failed (${response.status})`, response.status)
  }
  return (await response.json()) as T
}

function request<T>(fetchWithAuth: FetchWithAuth, path: string, init: RequestInit = {}): Promise<T> {
  return requestJson<T>(fetchWithAuth, `${BASE_PATH}${path}`, init)
}

function toPairing(payload: PairingPayload): Pairing {
  return { ...payload, deleted: false, releasedFlightIds: [], releasedFlightNumbers: [] }
}

function toList(payload: PairingListPayload): PairingList {
  return { ...payload, pairings: payload.pairings.map(toPairing) }
}

function query(params: BuildPairingParams): string {
  return new URLSearchParams({ dateFrom: params.dateFrom, dateTo: params.dateTo, base: params.base }).toString()
}

export function createBuildPairingsApi(fetchWithAuth: FetchWithAuth) {
  return {
    async listBases(): Promise<string[]> {
      const rows = await request<{ code: string; name: string }[]>(fetchWithAuth, '/bases')
      return rows.map((row) => row.code)
    },

    async listPairings(params: BuildPairingParams): Promise<PairingList> {
      return toList(await request<PairingListPayload>(fetchWithAuth, `/pairings?${query(params)}`))
    },

    /** A fresh random proposal. Nothing is stored until `commit`. */
    async generate(params: BuildPairingParams): Promise<GenerateResult> {
      const payload = await request<PairingListPayload & { committed: CommittedPairing[] }>(fetchWithAuth, '/pairings/generate', {
        method: 'POST',
        body: JSON.stringify(params),
      })
      return { ...toList(payload), committed: payload.committed }
    },

    async clear(params: BuildPairingParams): Promise<{ deleted: number; kept: number }> {
      return request(fetchWithAuth, `/pairings?${query(params)}`, { method: 'DELETE' })
    },

    async saveLegs(pairingId: string, legs: readonly FlightLeg[]): Promise<SaveLegsResult> {
      const result = await request<{ pairing: PairingPayload; withdrawnFromRun: boolean }>(fetchWithAuth, `/pairings/${pairingId}/legs`, {
        method: 'PUT',
        body: JSON.stringify({ legs: legs.map((leg) => ({ flightId: leg.flightId, addedManually: leg.addedManually })) }),
      })
      return { pairing: toPairing(result.pairing), withdrawnFromRun: result.withdrawnFromRun }
    },

    async deletePairing(pairingId: string): Promise<DeletePairingResult> {
      return request(fetchWithAuth, `/pairings/${pairingId}`, { method: 'DELETE' })
    },

    /** Stores the chosen pairings and hands them to the window's roster run. */
    async commit(params: BuildPairingParams, pairings: readonly CommitDraft[]): Promise<CommitResult> {
      return request(fetchWithAuth, '/pairings/commit', { method: 'POST', body: JSON.stringify({ ...params, pairings }) })
    },
  }
}

export type BuildPairingsApi = ReturnType<typeof createBuildPairingsApi>
