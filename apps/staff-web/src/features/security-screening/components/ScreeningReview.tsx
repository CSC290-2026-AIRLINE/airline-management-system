import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Decision, ReviewDraft, ReviewSubmission, ScreeningRecord } from '../types'
import {
  compareReviews,
  decisionLabel,
  displayStatus,
  formatDeparture,
  formatOccurredAt,
  isUrgent,
  latestReview,
  remainingTime,
  reviewHistory,
  reviewStatus,
  sourceLabel,
} from '../screening-model'
import editIcon from '../assets/edit.svg'
import { Badge } from './Badge'
import { DecisionForm, MatchNotice } from './DecisionForm'
import { ReviewDialog } from './ReviewDialog'

function InfoCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="sq-panel">
      {title && <h3>{title}</h3>}
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

function ReviewHistoryNote({ review, text, expanded, id }: { review?: Decision; text: string; expanded: boolean; id: string }) {
  return review ? (
    <div className="sq-review-history-note">
      <span>By {review.by}</span>
      <p id={id} hidden={!expanded}>
        {review.note}
      </p>
    </div>
  ) : (
    <>{text}</>
  )
}

export function ScreeningReview({
  record,
  onBack,
  onSave,
  submission,
}: {
  record: ScreeningRecord
  onBack: () => void
  onSave: (draft: ReviewDraft) => void
  submission: ReviewSubmission
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(() => new Set())
  function toggleReview(id: string) {
    setExpandedReviews((previous) => {
      const expanded = new Set(previous)
      if (expanded.has(id)) expanded.delete(id)
      else expanded.add(id)
      return expanded
    })
  }
  function reviewLink(review: Decision, noteId: string) {
    return (
      <button
        type="button"
        className="sq-history-review-link"
        aria-expanded={expandedReviews.has(review.id)}
        aria-controls={noteId}
        onClick={() => toggleReview(review.id)}
      >
        Review
      </button>
    )
  }
  const decision = latestReview(record)
  const history = reviewHistory(record)
  const orderedReviews = [...record.reviews].sort(compareReviews)
  const matchDetail =
    record.matchReason === 'passport_and_nationality'
      ? 'passport + nationality'
      : record.matchReason === 'passport'
        ? 'passport; nationality differs/missing'
        : record.matchReason === 'name_and_dob'
          ? 'name + DOB'
          : 'similar name'
  return (
    <div className="sq-review">
      <button className="sq-back" onClick={onBack} disabled={submission.saving}>
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
        </div>
      )}
      <section className="sq-passenger-summary">
        <div>
          <h2>{record.name}</h2>
          <p>
            Check {record.id} · from {sourceLabel(record.triggerPoint)}
            {sourceLabel(record.triggerPoint) === 'booking' ? ' (3b)' : ''} · {record.outcome}{' '}
            {formatOccurredAt(record.occurredAt, record.now)}
          </p>
        </div>
        <div className="sq-summary-badges">
          <Badge tone={displayStatus(record)}>{displayStatus(record)}</Badge>
          <Badge tone={record.match}>
            {record.match} · {matchDetail}
          </Badge>
        </div>
        <div className={`sq-departure ${isUrgent(record) && !decision ? 'sq-depart-urgent' : ''}`}>
          <span>DEPARTS</span>
          <strong>
            <span className="sq-mobile-only">Departs </span>
            {formatDeparture(record.flight.departureAt, record.now)}
            {!decision && ` · ${remainingTime(record)}`}
          </strong>
        </div>
      </section>
      {!decision && (
        <div className="sq-mobile-notice">
          <MatchNotice record={record} />
        </div>
      )}
      <div className="sq-review-grid">
        <div className="sq-review-information">
          <InfoCard>
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
                {record.comparison.map(([field, passenger, entry], index) => (
                  <tr key={field}>
                    <td>{field}</td>
                    <td>{passenger}</td>
                    <td>{entry}</td>
                    <td>
                      <Badge
                        tone={
                          (record.comparisonMatches?.[index] ?? passenger === entry) ? 'Same' : field === 'Name' ? 'Similar' : 'Different'
                        }
                      >
                        {(record.comparisonMatches?.[index] ?? passenger === entry) ? 'Same' : field === 'Name' ? 'Similar' : 'Different'}
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
              {record.comparison.map(([field, passenger, entry], index) => (
                <div className="sq-compare-field" key={field}>
                  <div>
                    <span>{field}</span>
                    <Badge
                      tone={
                        (record.comparisonMatches?.[index] ?? passenger === entry) ? 'Same' : field === 'Name' ? 'Similar' : 'Different'
                      }
                    >
                      {(record.comparisonMatches?.[index] ?? passenger === entry) ? 'Same' : field === 'Name' ? 'Similar' : 'Different'}
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
              {record.bookingSource && (
                <p className="sq-fine-print">
                  {record.bookingSource === 'mock' ? 'Demo booking details' : 'Booking details are not connected yet.'}
                </p>
              )}
              <Facts
                items={[
                  ['Booking', record.booking],
                  ['Booked by', record.bookedBy],
                  ['Flight', record.flight.label],
                  ['Others on booking', record.others],
                ]}
              />
            </InfoCard>
            <InfoCard title="WATCHLIST ENTRY">
              <Facts
                items={[
                  ['List type', record.listType],
                  ['Authority', record.authority ?? 'Not recorded'],
                  ['Reason', record.reason],
                  ['Listed', record.listed],
                ]}
              />
            </InfoCard>
          </div>
          <InfoCard title="SCREENING HISTORY">
            <table className="sq-history-table">
              <colgroup>
                {[19.5, 16, 16, 16.5, 32].map((width, index) => (
                  <col key={index} style={{ width: `${width}%` }} />
                ))}
              </colgroup>
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
                {history.map((row, i) => {
                  const review = i < record.history.length ? record.historyReviews?.[i] : orderedReviews[i - record.history.length]
                  const noteId = `sq-review-note-desktop-${review?.id ?? i}`
                  return (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>
                          {j === 1 && review ? (
                            reviewLink(review, noteId)
                          ) : j === 4 ? (
                            <ReviewHistoryNote
                              review={review}
                              text={cell}
                              id={noteId}
                              expanded={!!review && expandedReviews.has(review.id)}
                            />
                          ) : (
                            cell
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="sq-history-mobile">
              {history.map((row, i) => {
                const review = i < record.history.length ? record.historyReviews?.[i] : orderedReviews[i - record.history.length]
                const noteId = `sq-review-note-mobile-${review?.id ?? i}`
                return (
                  <div key={i}>
                    <div>
                      <span>
                        {row[0]} · {review ? reviewLink(review, noteId) : row[1]}
                      </span>
                      <Badge tone={row[2]}>{row[2]}</Badge>
                      <Badge tone={row[3]}>{row[3]}</Badge>
                    </div>
                    <div>
                      <ReviewHistoryNote review={review} text={row[4]} id={noteId} expanded={!!review && expandedReviews.has(review.id)} />
                    </div>
                  </div>
                )
              })}
            </div>
            {history.length === 1 && <p className="sq-fine-print sq-history-note">No earlier decision for this passenger on this entry.</p>}
          </InfoCard>
        </div>
        <aside className="sq-decision-column">
          <InfoCard title="DECISION">
            {decision ? (
              <>
                <Badge tone={reviewStatus(decision)}>{decisionLabel(record, decision)}</Badge>
                <Facts
                  items={[
                    ['Decided by', `${decision.by} · Security`],
                    ['Decided at', formatDeparture(decision.reviewedAt, record.now)],
                    ['Passport check', decision.passportCompared ? 'Compared in person ✓' : 'Not recorded'],
                  ]}
                />
                <h4>Note</h4>
                <p className="sq-saved-note">{decision.note}</p>
                {decision.decision === 'confirmed' && (
                  <p className="sq-error">Screening outcome: check-in denied. Authority notification is simulated.</p>
                )}
              </>
            ) : (
              <>
                <h4>Is this the person on the watchlist?</h4>
                <div className="sq-desktop-notice">
                  <MatchNotice record={record} />
                </div>
                <DecisionForm outcome={record.outcome} onSave={onSave} submission={submission} />
              </>
            )}
          </InfoCard>
          {decision && (
            <button className="sq-button sq-new-review" onClick={() => setDialogOpen(true)} disabled={submission.saving}>
              <img src={editIcon} alt="" />
              Add a new review
            </button>
          )}
          {decision && (
            <p
              className="sq-fine-print"
              title="Reviews are saved to the screening database. The highest revision is the current decision. Authority notification is simulated."
            >
              Read-only. Reviews are append-only: if a decision was wrong, a new review is added and the latest one wins. Logged in Feature
              15’s audit log.
            </p>
          )}
        </aside>
      </div>
      {dialogOpen && <ReviewDialog record={record} onClose={() => setDialogOpen(false)} onSave={onSave} submission={submission} />}
    </div>
  )
}
