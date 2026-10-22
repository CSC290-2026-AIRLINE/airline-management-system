import type { ScreeningRecord } from '../types'
import { Badge } from './Badge'

export function QueueList({ records, decided, onOpen }: { records: ScreeningRecord[]; decided: boolean; onOpen: (id: string) => void }) {
  if (!records.length)
    return (
      <div className="sq-empty" role="status">
        <h2>No passengers found</h2>
        <p>Try another search or queue filter.</p>
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
              <tr key={record.id} className={record.urgent && !decided ? 'sq-urgent' : ''}>
                <td>
                  <strong>{record.name}</strong>
                  <small>
                    from {record.source}
                    {decided ? ` · by ${record.decisions.at(-1)?.by}` : ''}
                  </small>
                </td>
                <td>
                  <Badge tone={record.status}>{record.status}</Badge>
                </td>
                <td>
                  <Badge tone={record.match}>{record.match}</Badge>
                </td>
                <td>{record.flight}</td>
                <td className={record.urgent && !decided ? 'sq-depart-urgent' : ''}>{record.departs}</td>
                <td className="sq-muted">{decided ? record.decisions.at(-1)?.at : record.since}</td>
                <td>
                  <button
                    className={`sq-button ${!decided && record.status === 'Held' ? 'sq-primary' : ''}`}
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
            className={`sq-queue-card ${record.urgent && !decided ? 'sq-urgent' : ''}`}
            onClick={() => onOpen(record.id)}
          >
            <span className="sq-card-line">
              <span>
                <strong>{record.name}</strong>
                <small>
                  from {record.source}
                  {decided ? ` · by ${record.decisions.at(-1)?.by}` : ''}
                </small>
              </span>
              <Badge tone={record.status}>{record.status}</Badge>
            </span>
            <span className="sq-card-line">
              <span>{record.flight}</span>
              <Badge tone={record.match}>{record.match}</Badge>
            </span>
            <span className="sq-card-times">
              <span className={record.urgent && !decided ? 'sq-depart-urgent' : ''}>Departs {record.departs}</span>
              <span>
                {decided ? 'Decided' : 'Since'} {decided ? record.decisions.at(-1)?.at : record.since}
              </span>
              <b>{decided ? 'View' : 'Review'} →</b>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
