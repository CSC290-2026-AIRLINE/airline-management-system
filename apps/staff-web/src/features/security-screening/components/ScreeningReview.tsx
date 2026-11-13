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
import { ArrowLeft, Pencil } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { Badge } from './Badge'
import { DecisionForm, MatchNotice } from './DecisionForm'
import { ReviewDialog } from './ReviewDialog'

function InfoCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Card className="gap-3 p-4">
      {title && <h3 className="m-0 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>}
      {children}
    </Card>
  )
}
function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[8rem_1fr] gap-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ReviewHistoryNote({ review, text }: { review?: Decision; text: string }) {
  return review ? (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">By {review.by}</span>
      <p>{review.note}</p>
    </div>
  ) : (
    <>{text}</>
  )
}

const compareTone = (record: ScreeningRecord, field: string, passenger: string, entry: string, index: number) =>
  (record.comparisonMatches?.[index] ?? passenger === entry) ? 'Same' : field === 'Name' ? 'Similar' : 'Different'

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
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={submission.saving}>
          <ArrowLeft />
          Back
        </Button>
      </div>
      {decision ? (
        <div>
          <h2 className="m-0 font-sans text-base font-semibold text-foreground">Decision details</h2>
          <p className="text-sm text-muted-foreground">Read-only record of what was compared and the decision saved with its note.</p>
        </div>
      ) : (
        <h2 className="m-0 font-sans text-base font-semibold md:hidden text-foreground">Screening Review</h2>
      )}
      <Card className="flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="m-0 font-sans text-base font-semibold text-foreground">{record.name}</h2>
          <p className="text-sm text-muted-foreground">
            Check {record.id} · from {sourceLabel(record.triggerPoint)}
            {sourceLabel(record.triggerPoint) === 'booking' ? ' (3b)' : ''} · {record.outcome}{' '}
            {formatOccurredAt(record.occurredAt, record.now)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={displayStatus(record)}>{displayStatus(record)}</Badge>
          <Badge tone={record.match}>
            {record.match} · {matchDetail}
          </Badge>
        </div>
        <div className={cn('text-sm', isUrgent(record) && !decision && 'text-orange-700')}>
          <span className="block text-xs text-muted-foreground uppercase">Departs</span>
          <strong>
            {formatDeparture(record.flight.departureAt, record.now)}
            {!decision && ` · ${remainingTime(record)}`}
          </strong>
        </div>
      </Card>
      {!decision && (
        <div className="md:hidden">
          <MatchNotice record={record} />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <InfoCard>
            <Table>
              <TableHeader>
                <TableRow>
                  {['Field', 'Passenger', 'Watchlist entry', 'Match'].map((label) => (
                    <TableHead scope="col" key={label}>
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {record.comparison.map(([field, passenger, entry], index) => {
                  const tone = compareTone(record, field, passenger, entry, index)
                  return (
                    <TableRow key={field}>
                      <TableCell className="font-medium">{field}</TableCell>
                      <TableCell>{passenger}</TableCell>
                      <TableCell>{entry}</TableCell>
                      <TableCell>
                        <Badge tone={tone}>{tone}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </InfoCard>
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard title="Booking & flight">
              {record.bookingSource === 'mock' && <p className="text-xs text-muted-foreground">Demo booking details</p>}
              <Facts
                items={[
                  ['Booking', record.booking],
                  ['Booked by', record.bookedBy],
                  ['Flight', record.flight.label],
                  ['Others on booking', record.others],
                ]}
              />
            </InfoCard>
            <InfoCard title="Watchlist entry">
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
          <InfoCard title="Screening history">
            <Table>
              <TableHeader>
                <TableRow>
                  {['When', 'From', 'Match', 'Outcome', 'Note'].map((label) => (
                    <TableHead key={label} scope="col">
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row, i) => {
                  const review = i < record.history.length ? record.historyReviews?.[i] : orderedReviews[i - record.history.length]
                  return (
                    <TableRow key={i}>
                      {row.map((cell, j) => (
                        <TableCell key={j} className={j === 4 ? 'whitespace-normal' : undefined}>
                          {j === 1 && review ? 'Review' : j === 4 ? <ReviewHistoryNote review={review} text={cell} /> : cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {history.length === 1 && <p className="text-xs text-muted-foreground">No earlier decision for this passenger on this entry.</p>}
          </InfoCard>
        </div>
        <aside className="flex flex-col gap-3">
          <InfoCard title="Decision">
            {decision ? (
              <>
                <div>
                  <Badge tone={reviewStatus(decision)}>{decisionLabel(record, decision)}</Badge>
                </div>
                <Facts
                  items={[
                    ['Decided by', `${decision.by} · Security`],
                    ['Decided at', formatDeparture(decision.reviewedAt, record.now)],
                    ['Passport check', decision.passportCompared ? 'Compared in person ✓' : 'Not recorded'],
                  ]}
                />
                <h4 className="m-0 font-sans text-sm font-semibold text-foreground">Note</h4>
                <p className="text-sm">{decision.note}</p>
                {decision.decision === 'confirmed' && (
                  <p className="text-sm text-destructive">Screening outcome: check-in denied. Authority notification is simulated.</p>
                )}
              </>
            ) : (
              <>
                <h4 className="m-0 font-sans text-sm font-semibold text-foreground">Is this the person on the watchlist?</h4>
                <div className="max-md:hidden">
                  <MatchNotice record={record} />
                </div>
                <DecisionForm outcome={record.outcome} onSave={onSave} submission={submission} />
              </>
            )}
          </InfoCard>
          {decision && (
            <Button variant="outline" onClick={() => setDialogOpen(true)} disabled={submission.saving}>
              <Pencil />
              Add a new review
            </Button>
          )}
        </aside>
      </div>
      {dialogOpen && <ReviewDialog record={record} onClose={() => setDialogOpen(false)} onSave={onSave} submission={submission} />}
    </div>
  )
}
