import { formatDateTime, formatDuration, formatTime } from '../format'
import type { ReportSession } from '../types'
import chatIcon from '../assets/icon-chat.svg'
import statusDotCompleted from '../assets/status-dot-completed.svg'
import statusDotInProgress from '../assets/status-dot-in-progress.svg'

interface SessionLogTableProps {
  sessions: ReportSession[]
  /** Called with the session whose chat transcript the user wants to read. */
  onSelect: (session: ReportSession) => void
  /** Extra class on the table. */
  className?: string
}

/**
 * The session table of the design (Figma node 6:257). Rows are clickable — the design's row component opens the
 * session chat transcript — so every row carries a real button in its action cell for keyboard users.
 *
 * Both the Overview's Session Logs card and the Session History screen use it.
 */
export function SessionLogTable({ sessions, onSelect, className }: SessionLogTableProps) {
  return (
    <table className={`ra-table${className ? ` ${className}` : ''}`}>
      <thead>
        <tr>
          <th className="ra-th ra-th--session" scope="col">
            SESSION
          </th>
          <th className="ra-th ra-th--start" scope="col">
            START TIME
          </th>
          <th className="ra-th ra-th--end" scope="col">
            END TIME
          </th>
          <th className="ra-th ra-th--duration" scope="col">
            DURATION
          </th>
          <th className="ra-th ra-th--questions" scope="col">
            QUESTIONS
          </th>
          <th className="ra-th ra-th--status" scope="col">
            STATUS
          </th>
          <th className="ra-th ra-th--action" scope="col">
            <span className="ra-visuallyHidden">Open chat</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((session) => {
          const isCompleted = session.status === 'completed'
          return (
            <tr key={session.id} className="ra-row" onClick={() => onSelect(session)}>
              <td className="ra-td ra-td--session">#{session.session_no}</td>
              <td className="ra-td ra-td--start">{formatDateTime(session.started_at)}</td>
              <td className="ra-td ra-td--end">{session.ended_at ? formatTime(session.ended_at) : '—'}</td>
              <td className="ra-td ra-td--duration">{formatDuration(session.duration_seconds)}</td>
              <td className="ra-td ra-td--questions">{session.questions}</td>
              <td className="ra-td ra-td--status">
                <span className="ra-status">
                  <img src={isCompleted ? statusDotCompleted : statusDotInProgress} alt="" aria-hidden="true" width={7} height={7} />
                  <span className={isCompleted ? 'ra-status--completed' : 'ra-status--inProgress'}>
                    {isCompleted ? 'Completed' : 'In progress'}
                  </span>
                </span>
              </td>
              <td className="ra-td ra-td--action">
                <button
                  type="button"
                  className="ra-chatButton"
                  aria-label={`Open chat transcript for session ${session.session_no}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(session)
                  }}
                >
                  <img src={chatIcon} alt="" aria-hidden="true" width={16} height={16} />
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
