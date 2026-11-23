import type { ReportOverview, ReportPeriod, ReportSessionPage, ReportSessionTranscript } from '../types'
import { useFetchJson } from './fetch'

/**
 * The Reports & Analytics endpoints (F16). See `../contracts/README.md` for the full contract — the backend team
 * builds against the same document.
 */

/** `GET /api/reports/overview?period=30days` — the stat cards and the sessions-per-day series. */
export function useGetReportOverview() {
  const fetchJson = useFetchJson()
  return function getReportOverview(period: ReportPeriod): Promise<ReportOverview> {
    return fetchJson<ReportOverview>(`/api/reports/overview?period=${encodeURIComponent(period)}`)
  }
}

/** `GET /api/reports/sessions?limit=7` — the Session Logs table. */
export function useListReportSessions() {
  const fetchJson = useFetchJson()
  return function listReportSessions(limit: number): Promise<ReportSessionPage> {
    return fetchJson<ReportSessionPage>(`/api/reports/sessions?limit=${limit}`)
  }
}

/** `GET /api/reports/sessions/:id` — one session's chat transcript. */
export function useGetReportSessionTranscript() {
  const fetchJson = useFetchJson()
  return function getReportSessionTranscript(id: string): Promise<ReportSessionTranscript> {
    return fetchJson<ReportSessionTranscript>(`/api/reports/sessions/${encodeURIComponent(id)}`)
  }
}
