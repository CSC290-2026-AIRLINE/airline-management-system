import { formatCount } from './format'
import { SessionLogTable } from './components/SessionLogTable'
import type { ReportSession } from './types'

interface SessionLogsTableProps {
  sessions: ReportSession[]
  /** How many sessions exist in total, not just the rows on screen. */
  total: number
  /** Called with the session whose chat transcript the user wants to read. */
  onSelect: (session: ReportSession) => void
}

/**
 * "Session Logs" card (Figma node 4:277). Rows are clickable — the design's row component opens the
 * session chat transcript — so every row carries a real button in its action cell for keyboard users.
 */
export function SessionLogsTable({ sessions, total, onSelect }: SessionLogsTableProps) {
  return (
    <section className="ra-card ra-logsCard">
      <header className="ra-cardHeader">
        <h2 className="ra-cardTitle">Session Logs</h2>
        <p className="ra-cardSummary">
          {sessions.length > 0
            ? `Latest ${sessions.length} of ${formatCount(total)} · Select a row to read the chat`
            : `No sessions recorded yet`}
        </p>
      </header>

      {sessions.length === 0 ? (
        <p className="raEmptyStateText">No sessions in this reporting period yet.</p>
      ) : (
        <SessionLogTable sessions={sessions} onSelect={onSelect} className="ra-logsTable" />
      )}
    </section>
  )
}
