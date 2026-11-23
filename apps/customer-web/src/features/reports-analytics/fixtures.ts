/**
 * Fixture payloads for the Reports & Analytics screen.
 *
 * These are the exact figures the Figma design ships with ("Integrated-F16-G14"), shaped like the API responses in
 * `types.ts`. They are what the screen falls back to while the backend endpoints are not up — the same code path
 * formats them, so the fallback looks exactly like the real thing.
 *
 * The design only draws the first page of each list. The rows after that are written here so the pagination can be
 * exercised before the backend is up.
 *
 * When the backend lands, delete this file and the `source: 'fixture'` branch in the hooks with it.
 */

import type {
  QaLogEntry,
  QaLogPage,
  QaLogQuery,
  ReportOverview,
  ReportPeriod,
  ReportSession,
  ReportSessionPage,
  ReportSessionQuery,
  ReportSessionTranscript,
} from './types'

const UPDATED_AT = '2026-11-12T23:53:00Z'

/** How many sessions the design says the reporting window holds. */
const TOTAL_SESSIONS = 1332
/** How many questions the design says passengers asked in the window. */
const TOTAL_QUESTIONS = 4795
/** How many of those questions went unanswered. */
const TOTAL_UNANSWERED = 144

/** How many rows a page of filtered results is counted over before the demo stops counting. */
const SCAN_LIMIT = 200

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
      total_sessions: TOTAL_SESSIONS,
      total_sessions_delta_pct: 4.2,
      avg_duration_seconds: 192,
      questions_asked: TOTAL_QUESTIONS,
      questions_per_session: 3.6,
      unanswered: TOTAL_UNANSWERED,
      unanswered_pct: 3.0,
    },
    daily_sessions: DAILY_SESSIONS.slice(-window.days),
  }
}

/**
 * The sessions the design draws, newest first. The Overview shows the first seven of them, the Session History
 * screen the first twelve.
 */
const DESIGN_SESSIONS: ReportSession[] = [
  {
    id: 'session-1332',
    session_no: 1332,
    started_at: '2026-11-12T23:41:00Z',
    ended_at: null,
    duration_seconds: null,
    questions: 2,
    unanswered: 1,
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
  {
    id: 'session-1325',
    session_no: 1325,
    started_at: '2026-11-12T20:58:00Z',
    ended_at: '2026-11-12T21:01:00Z',
    duration_seconds: 186,
    questions: 4,
    unanswered: 0,
    status: 'completed',
  },
  {
    id: 'session-1324',
    session_no: 1324,
    started_at: '2026-11-12T20:33:00Z',
    ended_at: '2026-11-12T20:34:00Z',
    duration_seconds: 52,
    questions: 1,
    unanswered: 0,
    status: 'completed',
  },
  {
    id: 'session-1323',
    session_no: 1323,
    started_at: '2026-11-12T20:10:00Z',
    ended_at: '2026-11-12T20:15:00Z',
    duration_seconds: 277,
    questions: 5,
    unanswered: 0,
    status: 'completed',
  },
  {
    id: 'session-1322',
    session_no: 1322,
    started_at: '2026-11-12T19:46:00Z',
    ended_at: '2026-11-12T19:49:00Z',
    duration_seconds: 178,
    questions: 3,
    unanswered: 0,
    status: 'completed',
  },
  {
    id: 'session-1321',
    session_no: 1321,
    started_at: '2026-11-12T19:22:00Z',
    ended_at: '2026-11-12T19:26:00Z',
    duration_seconds: 221,
    questions: 4,
    unanswered: 0,
    status: 'completed',
  },
]

/** The shape of the sessions the demo invents after the ones the design draws. */
const TAIL_SESSION_PATTERN: { duration: number; questions: number; unanswered: number }[] = [
  { duration: 252, questions: 4, unanswered: 0 },
  { duration: 235, questions: 3, unanswered: 0 },
  { duration: 178, questions: 5, unanswered: 1 },
  { duration: 130, questions: 3, unanswered: 0 },
  { duration: 331, questions: 6, unanswered: 0 },
  { duration: 164, questions: 3, unanswered: 0 },
  { duration: 186, questions: 4, unanswered: 0 },
  { duration: 292, questions: 5, unanswered: 0 },
  { duration: 52, questions: 1, unanswered: 0 },
  { duration: 277, questions: 5, unanswered: 0 },
  { duration: 178, questions: 3, unanswered: 0 },
  { duration: 241, questions: 4, unanswered: 0 },
]

/** `2026-11-12T19:22:00Z` — when the last session of the design starts. */
const LAST_DESIGN_SESSION = Date.UTC(2026, 10, 12, 19, 22)

/** The session at `index` of the newest-first list. The ones the design draws come first, the demo makes up the rest. */
function sessionAt(index: number): ReportSession {
  const design = DESIGN_SESSIONS[index]
  if (design) {
    return design
  }
  const offset = index - DESIGN_SESSIONS.length
  const pattern = TAIL_SESSION_PATTERN[offset % TAIL_SESSION_PATTERN.length]
  const sessionNo = DESIGN_SESSIONS[DESIGN_SESSIONS.length - 1].session_no - (offset + 1)
  const started = new Date(LAST_DESIGN_SESSION - (offset + 1) * 23 * 60_000)
  return {
    id: `session-${sessionNo}`,
    session_no: sessionNo,
    started_at: started.toISOString().replace('.000', ''),
    ended_at: new Date(started.getTime() + pattern.duration * 1000).toISOString().replace('.000', ''),
    duration_seconds: pattern.duration,
    questions: pattern.questions,
    unanswered: pattern.unanswered,
    status: 'completed',
  }
}

/** Every session the demo can show, newest first. */
function* demoSessions(): Generator<ReportSession> {
  for (let index = 0; ; index += 1) {
    yield sessionAt(index)
  }
}

/** One question and the robot's answer to it. */
function qa(sessionNo: number, order: number, question: string, answer: string | null): QaLogEntry {
  return { session_no: sessionNo, order: `Q${order}`, question, answer, answered: answer !== null }
}

/**
 * The questions the design draws, newest session first and then by order. The first nine are the design's; the rest
 * let the demo page on.
 */
const DESIGN_QA_ROWS: QaLogEntry[] = [
  qa(
    1332,
    1,
    'How do I get to the Airport Rail Link?',
    'Take the escalator down to level B1 and follow the Rail Link signs. Trains leave every 12 minutes.',
  ),
  qa(1332, 2, 'What time does the last train leave tonight?', null),
  qa(1331, 1, 'Where is gate B12?', 'Gate B12 is in Concourse B, about 6 minutes’ walk after security. Follow the yellow B signs.'),
  qa(1331, 2, 'Is flight FY218 to Chiang Mai on time?', 'Yes. FY218 is on time and starts boarding at 23:35 from gate B12.'),
  qa(1331, 3, 'Where can I charge my phone?', 'There are charging points next to gates B10 and B14.'),
  qa(1331, 4, 'Can I bring a power bank in my carry-on bag?', null),
  qa(1331, 5, 'Thank you!', 'You’re welcome. Have a pleasant flight!'),
  qa(1330, 1, 'Where is Lost & Found?', 'Lost & Found is on level 2, next to Arrivals exit 3.'),
  qa(
    1330,
    2,
    'Can I report a lost bag with you?',
    'I can’t file reports yet. Please visit the Flython baggage counter at Arrivals belt 5.',
  ),
  qa(1330, 3, 'Where is the baggage claim for belt 5?', 'Belt 5 is in the arrivals hall, past the immigration queue.'),
  qa(1330, 4, 'How long does baggage take to arrive?', 'Most bags arrive within 20 minutes of landing.'),
  qa(1329, 1, 'Where is the taxi rank?', 'The taxi rank is outside the terminal doors, to the left of arrivals.'),
  qa(1329, 2, 'How much is a taxi to the city?', 'Fares start at 180 baht, then the meter runs.'),
  qa(1329, 3, 'Where is the bus counter?', 'The bus counter is next to the taxi rank, outside arrivals.'),
  qa(1329, 4, 'Does the airport bus run at night?', null),
]

/** The questions the demo invents for the sessions after the ones the design draws. */
const TAIL_QA_QUESTIONS: { question: string; answer: string | null }[] = [
  { question: 'Where is the information desk?', answer: 'The information desk is in the departures hall, next to the check-in rows.' },
  { question: 'Is there a pharmacy past security?', answer: 'Yes. The pharmacy is in Concourse B, opposite gate B8.' },
  { question: 'Where can I buy a SIM card?', answer: 'The SIM counter is in the arrivals hall, next to the taxi rank.' },
  { question: 'What time does the last airport bus leave?', answer: null },
]

/** The question at `index` of the newest-session-first list. */
function qaRowAt(index: number): QaLogEntry {
  const design = DESIGN_QA_ROWS[index]
  if (design) {
    return design
  }
  const offset = index - DESIGN_QA_ROWS.length
  const sessionNo = 1328 - Math.floor(offset / TAIL_QA_QUESTIONS.length)
  const template = TAIL_QA_QUESTIONS[offset % TAIL_QA_QUESTIONS.length]
  return qa(sessionNo, (offset % TAIL_QA_QUESTIONS.length) + 1, template.question, template.answer)
}

/** Every question the demo can show, newest session first. */
function* demoQaRows(): Generator<QaLogEntry> {
  for (let index = 0; ; index += 1) {
    yield qaRowAt(index)
  }
}

/**
 * Takes the page of `limit` rows that follows `skip` matching rows.
 *
 * The demo's lists go on forever, so the scan stops after `cap` rows — otherwise a search that matches nothing
 * would keep the page busy for good.
 */
function pageOf<T>(source: () => Generator<T>, matches: (item: T) => boolean, skip: number, limit: number): T[] {
  let seen = 0
  let scanned = 0
  const items: T[] = []
  for (const item of source()) {
    scanned += 1
    if (!matches(item)) {
      if (scanned >= SCAN_LIMIT) {
        break
      }
      continue
    }
    if (seen < skip) {
      seen += 1
      continue
    }
    items.push(item)
    if (items.length >= limit) {
      break
    }
  }
  return items
}

/** Counts the matching rows the demo can show, up to `cap` matches and `cap` rows looked at. */
function countMatching<T>(source: () => Generator<T>, matches: (item: T) => boolean, cap: number): number {
  let count = 0
  let scanned = 0
  for (const item of source()) {
    scanned += 1
    if (matches(item)) {
      count += 1
    }
    if (count >= cap || scanned >= cap) {
      break
    }
  }
  return count
}

/** The page number a cursor points at. The demo's cursor is the page index. */
function pageOfCursor(cursor: string | null): number {
  const page = Number(cursor)
  return Number.isFinite(page) && page > 0 ? page : 0
}

/** The seven rows of the design's Session Logs table, newest first. */
export function fixtureSessions(): ReportSessionPage {
  return {
    total: TOTAL_SESSIONS,
    items: DESIGN_SESSIONS.slice(0, 7),
    next_cursor: null,
  }
}

/** Does this session pass the Session History filters? */
function matchesSession(session: ReportSession, query: ReportSessionQuery): boolean {
  if (query.status && session.status !== query.status) {
    return false
  }
  if (query.period && session.started_at < `${PERIODS[query.period].from}T00:00:00Z`) {
    return false
  }
  const search = query.search?.trim().toLowerCase()
  if (search && !session.id.toLowerCase().includes(search) && !String(session.session_no).includes(search)) {
    return false
  }
  return true
}

/** Is the Session History filter still the one the design shows? */
function isDefaultSessionQuery(query: ReportSessionQuery): boolean {
  return !query.search?.trim() && !query.status && (!query.period || query.period === '30days')
}

/** One page of the Session History list. */
export function fixtureSessionHistory(query: ReportSessionQuery, cursor: string | null, limit: number): ReportSessionPage {
  const page = pageOfCursor(cursor)
  const matches = (session: ReportSession) => matchesSession(session, query)
  const items = pageOf(demoSessions, matches, page * limit, limit)
  const total = isDefaultSessionQuery(query) ? TOTAL_SESSIONS : countMatching(demoSessions, matches, SCAN_LIMIT)
  return {
    total,
    items,
    next_cursor: items.length > 0 ? String(page + 1) : null,
  }
}

/** Does this question pass the All Q&A filters? */
function matchesQaRow(row: QaLogEntry, query: QaLogQuery): boolean {
  if (query.session_no !== undefined && query.session_no !== null && row.session_no !== query.session_no) {
    return false
  }
  if (query.answer === 'answered' && !row.answered) {
    return false
  }
  if (query.answer === 'unanswered' && row.answered) {
    return false
  }
  const search = query.search?.trim().toLowerCase()
  if (search && !row.question.toLowerCase().includes(search) && !(row.answer ?? '').toLowerCase().includes(search)) {
    return false
  }
  return true
}

/** Is the All Q&A filter still the one the design shows? */
function isDefaultQaQuery(query: QaLogQuery): boolean {
  return !query.search?.trim() && !query.session_no && (!query.answer || query.answer === 'all')
}

/** One page of the All Q&A list. */
export function fixtureQaLogs(query: QaLogQuery, cursor: string | null, limit: number): QaLogPage {
  const page = pageOfCursor(cursor)
  const matches = (row: QaLogEntry) => matchesQaRow(row, query)
  const items = pageOf(demoQaRows, matches, page * limit, limit)
  const isDefault = isDefaultQaQuery(query)
  const unanswered = isDefault ? TOTAL_UNANSWERED : countMatching(demoQaRows, (row) => matches(row) && !row.answered, SCAN_LIMIT)
  return {
    total: isDefault ? TOTAL_QUESTIONS : countMatching(demoQaRows, matches, SCAN_LIMIT),
    unanswered,
    items,
    next_cursor: items.length > 0 ? String(page + 1) : null,
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
