import { requestJson, type FetchWithAuth } from '../../build-pairings/types/api'
import type { BuildPairingParams } from '../../build-pairings/types/types'
import type { FixOutcome, FixPublishData } from './types'

/**
 * Calls to `/api/crew-rostering/fix-publish`, through `fetchWithAuth` so every request
 * carries the staff access token. No cache: the page hook owns its state until the
 * shared TanStack Query setup lands.
 */

const BASE_PATH = '/api/crew-rostering/fix-publish'
const NEXT_RUN_PATH = '/api/crew-rostering/build-pairing/runs/next'

export function createFixPublishApi(fetchWithAuth: FetchWithAuth) {
  const request = <T>(path: string, body?: unknown) =>
    requestJson<T>(fetchWithAuth, `${BASE_PATH}${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) })
  const post = <T>(path: string, body: unknown = {}) => request<T>(path, body)

  return {
    getState: (params: BuildPairingParams) =>
      request<FixPublishData>(`/state?${new URLSearchParams({ dateFrom: params.dateFrom, dateTo: params.dateTo, base: params.base })}`),

    /**
     * Starts the next draft roster run for the window from the drafts the last one left out. `rosterRun` is null when
     * there was nothing to carry over.
     */
    startNextRun: (params: BuildPairingParams) =>
      requestJson<{ rosterRun: { id: string } | null; moved: number; left: number }>(fetchWithAuth, NEXT_RUN_PATH, {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    check: (rosterRunId: string) => post<FixPublishData>(`/runs/${rosterRunId}/check`),

    swap: (breakId: string, replacementId: string) => post<FixOutcome>(`/breaks/${breakId}/swap`, { replacementId }),

    override: (breakId: string, reason: string) => post<FixOutcome>(`/breaks/${breakId}/override`, { reason }),

    sickCall: (rosterRunId: string, input: { legId: string; memberId: string; reason: string }) =>
      post<FixOutcome>(`/runs/${rosterRunId}/sick-calls`, input),

    publish: (rosterRunId: string) => post<FixPublishData>(`/runs/${rosterRunId}/publish`),
  }
}
