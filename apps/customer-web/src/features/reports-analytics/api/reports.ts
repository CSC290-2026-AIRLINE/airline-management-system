import type {
  QaLogPage,
  QaLogQuery,
  ReportOverview,
  ReportPeriod,
  ReportSessionPage,
  ReportSessionQuery,
  ReportSessionTranscript,
} from '../types'
import { useFetchJson } from './fetch'

/**
 * The Reports & Analytics endpoints (F16). See `../contracts/README.md` for the full contract — the backend team
 * builds against the same document.
 */

/** The query values the endpoints accept. */
type QueryValue = string | number | boolean | null | undefined

/** Builds the query string, leaving out the filters that are not set. */
function queryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') {
      continue
    }
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

/** `GET /api/reports/overview?period=30days` — the stat cards and the sessions-per-day series. */
export function useGetReportOverview() {
  const fetchJson = useFetchJson()
  return function getReportOverview(period: ReportPeriod): Promise<ReportOverview> {
    return fetchJson<ReportOverview>(`/api/reports/overview?period=${encodeURIComponent(period)}`)
  }
}

/** `GET /api/reports/sessions?limit=7` — the Session Logs table and the Session History screen. */
export function useListReportSessions() {
  const fetchJson = useFetchJson()
  return function listReportSessions(query: ReportSessionQuery = {}): Promise<ReportSessionPage> {
    return fetchJson<ReportSessionPage>(
      `/api/reports/sessions${queryString({
        search: query.search,
        period: query.period,
        status: query.status,
        cursor: query.cursor,
        limit: query.limit,
      })}`,
    )
  }
}

/** `GET /api/reports/qa-logs` — the All Q&A Logs screen. */
export function useListReportQaLogs() {
  const fetchJson = useFetchJson()
  return function listReportQaLogs(query: QaLogQuery = {}): Promise<QaLogPage> {
    return fetchJson<QaLogPage>(
      `/api/reports/qa-logs${queryString({
        search: query.search,
        session_no: query.session_no,
        answer: query.answer,
        cursor: query.cursor,
        limit: query.limit,
      })}`,
    )
  }
}

/** `GET /api/reports/sessions/:id` — one session's chat transcript. */
export function useGetReportSessionTranscript() {
  const fetchJson = useFetchJson()
  return function getReportSessionTranscript(id: string): Promise<ReportSessionTranscript> {
    return fetchJson<ReportSessionTranscript>(`/api/reports/sessions/${encodeURIComponent(id)}`)
  }
}
