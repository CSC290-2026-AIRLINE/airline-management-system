import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Decision, ScreeningRecord } from '../types'
import editIcon from '../assets/edit.svg'
import { Badge } from './Badge'
import { DecisionForm, MatchNotice } from './DecisionForm'
import { ReviewDialog } from './ReviewDialog'

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sq-panel">
      <h3>
        {title === 'PASSENGER (AS SCREENED) VS WATCHLIST ENTRY' ? (
          <>
            <span className="sq-desktop-only">{title}</span>
            <span className="sq-mobile-only">PASSENGER VS WATCHLIST ENTRY</span>
          </>
        ) : (
          title
        )}
      </h3>
      {children}
    </section>
  )
}
function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="sq-facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ScreeningReview({
  record,
  onBack,
  onSave,
}: {
  record: ScreeningRecord
  onBack: () => void
  onSave: (decision: Decision) => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const decision = record.decisions.at(-1)
  const matchDetail = record.match === 'Strong' ? 'passport + nationality' : record.match === 'Probable' ? 'name + DOB' : 'similar name'
  return (
    <div className="sq-review">
      <button className="sq-back" onClick={onBack}>
        ← Back
      </button>
      {decision ? (
        <div className="sq-detail-heading">
          <h2>Decision details</h2>
          <p>Read-only record of what was compared and the decision saved with its note.</p>
        </div>
      ) : (
        <div className="sq-mobile-review-heading">
          <h2>Screening Review</h2>
          <p>Compare the passenger with the watchlist entry, then decide.</p>
        </div>
      )}
      <section className="sq-passenger-summary">
        <div>
          <h2>{record.name}</h2>
          <p>
            Check {record.id} · from {record.source}
            {record.source === 'booking' ? ' (3b)' : ''} · {record.source === 'check-in' ? 'held' : 'flagged'} {record.since}
          </p>
        </div>
        <div className="sq-summary-badges">
          <Badge tone={record.status}>{record.status}</Badge>
          <Badge tone={record.match}>
            {record.match} · {matchDetail}
          </Badge>
        </div>
        <div className={`sq-departure ${record.urgent && !decision ? 'sq-depart-urgent' : ''}`}>
          <span>DEPARTS</span>
          <strong>
            <span className="sq-mobile-only">Departs </span>
            {record.departs}
            {!decision && record.remaining && ` · in ${record.remaining}`}
          </strong>
        </div>
      </section>
      {!decision && (
        <div className="sq-mobile-notice">
          <MatchNotice match={record.match} />
        </div>
      )}
      <div className="sq-review-grid">
        <div className="sq-review-information">
          <InfoCard title="PASSENGER (AS SCREENED) VS WATCHLIST ENTRY">
            <p className="sq-snapshot">
              <span className="sq-desktop-only">
                Snapshot taken at screening, not today’s profile · Name similarity {record.similarity}
                {!decision && record.match !== 'Strong' ? ' (best of both name orders)' : ''} · Passports show the last 4 digits.
              </span>
              <span className="sq-mobile-only">
                Snapshot at screening · Name similarity {record.similarity} · Passports show the last 4 digits.
              </span>
            </p>
            <table className="sq-comparison-table">
              <thead>
                <tr>
                  {['FIELD', 'PASSENGER', 'WATCHLIST ENTRY', 'MATCH'].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {record.comparison.map(([field, passenger, entry]) => (
                  <tr key={field}>
                    <td>{field}</td>
                    <td>{passenger}</td>
                    <td>{entry}</td>
                    <td>
                      <Badge tone={passenger === entry ? 'Same' : field === 'Name' ? 'Similar' : 'Different'}>
                        {passenger === entry ? 'Same' : field === 'Name' ? 'Similar' : 'Different'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sq-comparison-mobile">
              <div className="sq-compare-head">
                <span>PASSENGER</span>
                <span>WATCHLIST ENTRY</span>
              </div>
              {record.comparison.map(([field, passenger, entry]) => (
                <div className="sq-compare-field" key={field}>
                  <div>
                    <span>{field}</span>
                    <Badge tone={passenger === entry ? 'Same' : field === 'Name' ? 'Similar' : 'Different'}>
                      {passenger === entry ? 'Same' : field === 'Name' ? 'Similar' : 'Different'}
                    </Badge>
                  </div>
                  <div>
                    <span>{passenger}</span>
                    <span>{entry}</span>
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>
          <div className="sq-info-pair">
            <InfoCard title="BOOKING & FLIGHT">
              <Facts
                items={[
                  ['Booking', record.booking],
                  ['Booked by', record.bookedBy],
                  ['Flight', record.flight],
                  ['Others on booking', record.others],
                ]}
              />
            </InfoCard>
            <InfoCard title="WATCHLIST ENTRY">
              <Facts
                items={[
                  ['List type', record.listType],
                  ['Authority', '[Demo authority]'],
                  ['Reason', record.reason],
                  ['Listed', record.listed],
                ]}
              />
            </InfoCard>
          </div>
          <InfoCard title="SCREENING HISTORY">
            <table className="sq-history-table">
              <thead>
                <tr>
                  {['WHEN', 'FROM', 'MATCH', 'OUTCOME', 'NOTE'].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {record.history.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sq-history-mobile">
              {record.history.map((row, i) => (
                <div key={i}>
                  <div>
                    <span>
                      {row[0]} · {row[1]}
                    </span>
                    <Badge tone={row[2]}>{row[2]}</Badge>
                    <Badge tone={row[3]}>{row[3]}</Badge>
                  </div>
                  <p>{row[4]}</p>
                </div>
              ))}
            </div>
            {record.history.length === 1 && (
              <p className="sq-fine-print sq-history-note">No earlier decision for this passenger on this entry.</p>
            )}
          </InfoCard>
        </div>
        <aside className="sq-decision-column">
          <InfoCard title="DECISION">
            {decision ? (
              <>
                <Badge tone={decision.status}>
                  {decision.status} ·{' '}
                  {decision.status === 'Confirmed'
                    ? 'authority notified'
                    : record.match === 'Weak'
                      ? 'flag cleared'
                      : 'not the same person'}
                </Badge>
                <Facts
                  items={[
                    ['Decided by', `${decision.by} · Security`],
                    ['Decided at', `Today ${decision.at}`],
                    ['Passport check', 'Compared in person ✓'],
                  ]}
                />
                <h4>Note</h4>
                <p className="sq-saved-note">{decision.note}</p>
                {decision.status === 'Confirmed' && (
                  <p className="sq-error">Check-in denied. The authority was notified through Feature 13 (mocked).</p>
                )}
              </>
            ) : (
              <>
                <h4>Is this the person on the watchlist?</h4>
                <div className="sq-desktop-notice">
                  <MatchNotice match={record.match} />
                </div>
                <DecisionForm weak={record.match === 'Weak'} onSave={onSave} />
              </>
            )}
          </InfoCard>
          {decision && (
            <button className="sq-button sq-new-review" onClick={() => setDialogOpen(true)}>
              <img src={editIcon} alt="" />
              Add a new review
            </button>
          )}
          <p className="sq-fine-print">
            {decision
              ? 'Read-only. Reviews are append-only: if a decision was wrong, a new review is added and the latest one wins. Logged in Feature 15’s audit log.'
              : 'Your decision is added as a new review (the latest wins, earlier ones are kept) and logged in Feature 15’s audit log.'}
          </p>
        </aside>
      </div>
      {dialogOpen && <ReviewDialog record={record} onClose={() => setDialogOpen(false)} onSave={onSave} />}
    </div>
  )
}
