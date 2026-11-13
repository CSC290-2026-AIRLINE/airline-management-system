import { requestJson, type FetchWithAuth } from '../../build-pairings/types/api'
import type { AssignCrewParams, RosterPairing, RosterRun, RuleLimits, RunResult } from './types'

/**
 * Calls to `/api/crew-rostering/assign-crew`, through `fetchWithAuth` so every request
 * carries the staff access token. No cache: the page hook owns its state until the
 * shared TanStack Query setup lands.
 */

const BASE_PATH = '/api/crew-rostering/assign-crew'

export interface CommittedPairings {
  /** The run Build pairings committed for exactly this base and window, if any. */
  rosterRun: RosterRun | null
  pairings: RosterPairing[]
  /** Pairings in the window that were not committed (invalid, or not committed yet). */
  uncommitted: { id: string; code: string }[]
  totalLegs: number
  limits: RuleLimits
}

export function createAssignCrewApi(fetchWithAuth: FetchWithAuth) {
  const request = <T>(path: string, init?: RequestInit) => requestJson<T>(fetchWithAuth, `${BASE_PATH}${path}`, init)

  return {
    listBases: () => request<string[]>('/bases'),

    listPairings: (params: AssignCrewParams) =>
      request<CommittedPairings>(
        `/pairings?${new URLSearchParams({ dateFrom: params.dateFrom, dateTo: params.dateTo, base: params.base })}`,
      ),

    getRun: (rosterRunId: string) => request<RunResult>(`/runs/${rosterRunId}`),

    autoAssign: (rosterRunId: string, pairingIds: readonly string[]) =>
      request<RunResult>(`/runs/${rosterRunId}/auto-assign`, { method: 'POST', body: JSON.stringify({ pairingIds }) }),
  }
}
