/**
 * Fixture payloads for the Reports & Analytics screen.
 *
 * These are the exact figures the Figma design ships with ("Integrated-F16-G14", frame 4:2), shaped like the
 * API responses in `types.ts`. They are what the screen falls back to while the backend endpoints are not up —
 * the same code path formats them, so the fallback looks exactly like the real thing.
 *
 * When the backend lands, delete this file and the `source: 'fixture'` branch in the hooks with it.
 */

import type { ReportOverview, ReportPeriod, ReportSession, ReportSessionPage, ReportSessionTranscript } from './types'

const UPDATED_AT = '2026-11-12T23:53:00Z'

/** The 30 days the design plots, oldest first. */
const DAILY_SESSIONS: { date: string; sessions: number }[] = [
  { date: '2026-10-14', sessions: 38 },
  { date: '2026-10-15', sessions: 41 },
  { date: '2026-10-16', sessions: 52 },
  { date: '2026-10-17', sessions: 44 },
  { date: '2026-10-18', sessions: 40 },
  { date: '2026-10-19', sessions: 46 },
  { date: '2026-10-20', sessions: 51 },
  { date: '2026-10-21', sessions: 43 },
  { date: '2026-10-22', sessions: 35 },
  { date: '2026-10-23', sessions: 49 },
  { date: '2026-10-24', sessions: 53 },
  { date: '2026-10-25', sessions: 42 },
  { date: '2026-10-26', sessions: 41 },
  { date: '2026-10-27', sessions: 50 },
  { date: '2026-10-28', sessions: 45 },
  { date: '2026-10-29', sessions: 33 },
  { date: '2026-10-30', sessions: 44 },
  { date: '2026-10-31', sessions: 55 },
  { date: '2026-11-01', sessions: 47 },
  { date: '2026-11-02', sessions: 39 },
  { date: '2026-11-03', sessions: 46 },
  { date: '2026-11-04', sessions: 48 },
  { date: '2026-11-05', sessions: 36 },
  { date: '2026-11-06', sessions: 45 },
  { date: '2026-11-07', sessions: 51 },
  { date: '2026-11-08', sessions: 47 },
  { date: '2026-11-09', sessions: 37 },
  { date: '2026-11-10', sessions: 42 },
  { date: '2026-11-11', sessions: 48 },
  { date: '2026-11-12', sessions: 44 },
]

/** First and last day of each window, and how many days of the series it covers. */
const PERIODS: Record<ReportPeriod, { from: string; to: string; days: number }> = {
  today: { from: '2026-11-12', to: '2026-11-12', days: 1 },
  '7days': { from: '2026-11-06', to: '2026-11-12', days: 7 },
  '30days': { from: '2026-10-14', to: '2026-11-12', days: 30 },
  '3months': { from: '2026-08-14', to: '2026-11-12', days: 30 },
  '12months': { from: '2025-12-12', to: '2026-11-12', days: 30 },
}

/** The overview the design shows, for any window. */
export function fixtureOverview(period: ReportPeriod): ReportOverview {
  const window = PERIODS[period]
  return {
    period,
    range: { from: window.from, to: window.to },
    updated_at: UPDATED_AT,
    stats: {
      total_sessions: 1332,
      total_sessions_delta_pct: 4.2,
      avg_duration_seconds: 192,
      questions_asked: 4795,
      questions_per_session: 3.6,
      unanswered: 144,
      unanswered_pct: 3.0,
    },
    daily_sessions: DAILY_SESSIONS.slice(-window.days),
  }
}

/** The seven rows of the design's Session Logs table, newest first. */
export function fixtureSessions(): ReportSessionPage {
  return {
    total: 1332,
    items: [
      {
        id: 'session-1332',
        session_no: 1332,
        started_at: '2026-11-12T23:41:00Z',
        ended_at: null,
        duration_seconds: null,
        questions: 2,
        unanswered: 0,
        status: 'in_progress',
      },
      {
        id: 'session-1331',
        session_no: 1331,
        started_at: '2026-11-12T23:12:00Z',
        ended_at: '2026-11-12T23:16:00Z',
        duration_seconds: 245,
        questions: 5,
        unanswered: 1,
        status: 'completed',
      },
      {
        id: 'session-1330',
        session_no: 1330,
        started_at: '2026-11-12T22:58:00Z',
        ended_at: '2026-11-12T23:00:00Z',
        duration_seconds: 108,
        questions: 2,
        unanswered: 0,
        status: 'completed',
      },
      {
        id: 'session-1329',
        session_no: 1329,
        started_at: '2026-11-12T22:31:00Z',
        ended_at: '2026-11-12T22:35:00Z',
        duration_seconds: 232,
        questions: 4,
        unanswered: 0,
        status: 'completed',
      },
      {
        id: 'session-1328',
        session_no: 1328,
        started_at: '2026-11-12T22:04:00Z',
        ended_at: '2026-11-12T22:06:00Z',
        duration_seconds: 130,
        questions: 3,
        unanswered: 0,
        status: 'completed',
      },
      {
        id: 'session-1327',
        session_no: 1327,
        started_at: '2026-11-12T21:47:00Z',
        ended_at: '2026-11-12T21:53:00Z',
        duration_seconds: 331,
        questions: 6,
        unanswered: 0,
        status: 'completed',
      },
      {
        id: 'session-1326',
        session_no: 1326,
        started_at: '2026-11-12T21:20:00Z',
        ended_at: '2026-11-12T21:23:00Z',
        duration_seconds: 164,
        questions: 3,
        unanswered: 0,
        status: 'completed',
      },
    ],
  }
}

/**
 * The transcript the design shows in the chat modal. The design only draws one, so the fixture serves the
 * same one for every session until the backend returns real transcripts.
 */
export function fixtureTranscript(session: ReportSession): ReportSessionTranscript {
  return {
    id: session.id,
    session_no: session.session_no,
    started_at: session.started_at,
    ended_at: session.ended_at,
    duration_seconds: session.duration_seconds,
    questions: session.questions,
    unanswered: session.unanswered,
    turns: [
      { order: 1, role: 'passenger', text: 'Where is gate B12?' },
      {
        order: 2,
        role: 'robot',
        text: 'Gate B12 is in Concourse B, about 6 minutes’ walk after security. Follow the yellow B signs.',
      },
      { order: 3, role: 'passenger', text: 'Is flight FY218 to Chiang Mai on time?' },
      { order: 4, role: 'robot', text: 'Yes. FY218 is on time and starts boarding at 23:35 from gate B12.' },
      { order: 5, role: 'passenger', text: 'Where can I charge my phone?' },
      { order: 6, role: 'robot', text: 'There are charging points next to gates B10 and B14.' },
      { order: 7, role: 'passenger', text: 'Can I bring a power bank in my carry-on bag?' },
      { order: 8, role: 'robot', text: null },
      { order: 9, role: 'passenger', text: 'Thank you!' },
      { order: 10, role: 'robot', text: 'You’re welcome. Have a pleasant flight!' },
    ],
  }
}
