/**
 * Wire shapes for the Reports & Analytics endpoints (F16).
 *
 * These mirror the DTOs the backend team will expose under `/api/reports/*` — see
 * `contracts/README.md` in this folder for the full contract (field notes, timestamp format, error codes).
 *
 * Timestamps are ISO-8601 in UTC (`2026-11-12T23:41:00Z`) and dates are ISO calendar dates
 * (`2026-10-14`). The frontend formats them for display, so the backend should never send pre-formatted strings.
 */

/** Reporting window. Mirrors the period selector in the design. */
export type ReportPeriod = 'today' | '7days' | '30days' | '3months' | '12months'

export interface ReportStats {
  /** Sessions in the selected window. */
  total_sessions: number
  /** Change against the previous window of the same length, as a percentage. `null` when there is no comparison. */
  total_sessions_delta_pct: number | null
  /** Mean completed session length, in seconds. `null` when no session completed in the window. */
  avg_duration_seconds: number | null
  /** Questions asked in the window. */
  questions_asked: number
  /** Questions per session in the window. `null` when there are no sessions. */
  questions_per_session: number | null
  /** Questions with no recorded answer. */
  unanswered: number
  /** Share of questions that went unanswered, as a percentage. `null` when there are no questions. */
  unanswered_pct: number | null
}

export interface DailySessionPoint {
  /** ISO calendar date, `YYYY-MM-DD`. */
  date: string
  /** Sessions started on that day. */
  sessions: number
}

export interface ReportOverview {
  period: ReportPeriod
  /** First and last day covered by the window, as ISO calendar dates. */
  range: { from: string; to: string }
  /** When the numbers were last computed, ISO-8601 UTC. */
  updated_at: string
  stats: ReportStats
  /** One point per day in the window, oldest first. */
  daily_sessions: DailySessionPoint[]
}

export type ReportSessionStatus = 'completed' | 'in_progress'

export interface ReportSession {
  id: string
  /** Display number, e.g. `1331` for "Session #1331". */
  session_no: number
  started_at: string
  /** `null` while the session is still running. */
  ended_at: string | null
  /** Wall-clock length in seconds. `null` while the session is still running. */
  duration_seconds: number | null
  /** How many questions the passenger asked. */
  questions: number
  /** How many of those questions have no recorded answer. */
  unanswered: number
  status: ReportSessionStatus
}

export interface ReportSessionPage {
  /** Total sessions matching the query, not just the returned page. */
  total: number
  items: ReportSession[]
  /** Cursor for the next page, or `null` when this is the last one. */
  next_cursor: string | null
}

/** Filters for the Session History screen. */
export interface ReportSessionQuery {
  /** Free text matched against the session id. */
  search?: string
  /** Reporting window. */
  period?: ReportPeriod
  /** `completed`, `in_progress`, or nothing for both. */
  status?: ReportSessionStatus
  /** Cursor of the page to read. `null` for the first page. */
  cursor?: string | null
  /** How many rows a page holds. */
  limit?: number
}

/** One question and the robot's answer to it. */
export interface QaLogEntry {
  /** Display number of the session the question was asked in. */
  session_no: number
  /** Position of the question inside its session, e.g. `"Q2"`. */
  order: string
  question: string
  /** The robot's answer. Empty when the question went unanswered. */
  answer: string | null
  answered: boolean
}

export interface QaLogPage {
  /** Total questions matching the query, not just the returned page. */
  total: number
  /** How many of the matching questions have no recorded answer. */
  unanswered: number
  items: QaLogEntry[]
  /** Cursor for the next page, or `null` when this is the last one. */
  next_cursor: string | null
}

/** Filters for the All Q&A Logs screen. */
export interface QaLogQuery {
  /** Free text matched against the question and the answer. */
  search?: string
  /** Restrict to one session, by its display number. */
  session_no?: number | null
  /** `all`, `answered` or `unanswered`. */
  answer?: 'all' | 'answered' | 'unanswered'
  /** Cursor of the page to read. `null` for the first page. */
  cursor?: string | null
  /** How many rows a page holds. */
  limit?: number
}

export type ChatRole = 'passenger' | 'robot'

export interface ReportSessionTurn {
  /** Position in the transcript, starting at 1. */
  order: number
  role: ChatRole
  /** What was said. `null` for a robot turn with no recorded answer. */
  text: string | null
}

export interface ReportSessionTranscript {
  id: string
  session_no: number
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  questions: number
  unanswered: number
  /** Every turn, ordered by `order`. */
  turns: ReportSessionTurn[]
}
