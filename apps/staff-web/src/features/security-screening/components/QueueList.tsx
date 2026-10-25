import type { ScreeningRecord } from '../types'
import { displayStatus, formatDeparture, formatOccurredAt, formatTime, isUrgent, latestReview, sourceLabel } from '../screening-model'
import { Badge } from './Badge'

export function QueueList({ records, decided, onOpen }: { records: ScreeningRecord[]; decided: boolean; onOpen: (id: string) => void }) {
  if (!records.length)
    return (
      <div className="sq-empty" role="status">
        <h2>No screening checks found</h2>
        <p>No checks match this view. Try another filter or refresh after a screening run.</p>
      </div>
    )
  return (
    <>
      <div className="sq-queue-table">
        <table>
          <colgroup>
            {[250, 110, 110, 190, 140, 120, 114].map((width, i) => (
              <col key={i} style={{ width: `${width / 10.34}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {['PASSENGER', 'STATUS', 'MATCH', 'FLIGHT', 'DEPARTS', decided ? 'DECIDED' : 'WAITING SINCE', ''].map((label, i) => (
                <th key={i} scope="col">
                  {label || <span className="sq-sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className={isUrgent(record) && !decided ? 'sq-urgent' : ''}>
                <td>
                  <strong>{record.name}</strong>
                  <small>
                    from {sourceLabel(record.triggerPoint)}
                    {decided ? ` · by ${latestReview(record)?.by}` : ''}
                  </small>
                </td>
                <td>
                  <Badge tone={displayStatus(record)}>{displayStatus(record)}</Badge>
                </td>
                <td>
                  <Badge tone={record.match}>{record.match}</Badge>
                </td>
                <td>{record.flight.label}</td>
                <td className={isUrgent(record) && !decided ? 'sq-depart-urgent' : ''}>
                  {formatDeparture(record.flight.departureAt, record.now)}
                </td>
                <td className="sq-muted">
                  {decided ? formatTime(latestReview(record)!.reviewedAt) : formatOccurredAt(record.occurredAt, record.now)}
                </td>
                <td>
                  <button
                    className={`sq-button ${!decided && displayStatus(record) === 'Held' ? 'sq-primary' : ''}`}
                    onClick={() => onOpen(record.id)}
                  >
                    {decided ? 'View' : 'Review'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sq-queue-cards">
        {records.map((record) => (
          <button
            key={record.id}
            className={`sq-queue-card ${isUrgent(record) && !decided ? 'sq-urgent' : ''}`}
            onClick={() => onOpen(record.id)}
          >
            <span className="sq-card-line">
              <span>
                <strong>{record.name}</strong>
                <small>
                  from {sourceLabel(record.triggerPoint)}
                  {decided ? ` · by ${latestReview(record)?.by}` : ''}
                </small>
              </span>
              <Badge tone={displayStatus(record)}>{displayStatus(record)}</Badge>
            </span>
            <span className="sq-card-line">
              <span>{record.flight.label}</span>
              <Badge tone={record.match}>{record.match}</Badge>
            </span>
            <span className="sq-card-times">
              <span className={isUrgent(record) && !decided ? 'sq-depart-urgent' : ''}>
                Departs {formatDeparture(record.flight.departureAt, record.now)}
              </span>
              <span>
                {decided ? 'Decided' : 'Since'}{' '}
                {decided ? formatTime(latestReview(record)!.reviewedAt) : formatOccurredAt(record.occurredAt, record.now)}
              </span>
              <b>{decided ? 'View' : 'Review'} →</b>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
