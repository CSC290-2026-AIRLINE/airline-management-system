import type {
  Comparison,
  Decision,
  Filter,
  HistoryRow,
  Match,
  MatchReason,
  ReviewDraft,
  ScreeningOutcome,
  ScreeningRecord,
  TriggerPoint,
} from './types'
import { formatDeparture, sourceLabel } from './screening-model.ts'

export type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>
export interface ApiReview {
  id: string
  revision: number
  decision: 'confirmed' | 'false_positive'
  note: string
  by: string
  reviewedAt: string
  passportCompared: boolean | null
  authorityNotifiedAt: string | null
  notificationMode: 'mock' | null
}
export interface ApiCheck {
  id: string
  runId: string
  passengerId: string
  watchlistEntryId: string | null
  name: string
  triggerPoint: TriggerPoint
  outcome: ScreeningOutcome
  match: 'none' | 'weak' | 'probable' | 'strong'
  matchReason: MatchReason
  occurredAt: string
  similarity: number | null
  flight: { id: string; label: string; departureAt: string; status: string }
  latestReview: ApiReview | null
}
interface ApiIdentity {
  firstName: string
  lastName: string
  dateOfBirth: string | null
  nationality: string | null
  gender: string | null
  passportNumber: string | null
  passportLast4: string | null
}
export interface ApiDetail extends ApiCheck {
  now: string
  snapshot: { passenger: ApiIdentity; entry: ApiIdentity | null }
  watchlist: { listType: string; issuingAuthority: string; reason: string | null; listedAt: string; status: string; source: string } | null
  booking: { source: 'mock' | 'not_connected'; reference: string | null; bookedBy: string | null; others: string | null }
  reviews: ApiReview[]
  history: {
    id: string
    triggerPoint: TriggerPoint
    match: ApiCheck['match']
    outcome: ScreeningOutcome
    occurredAt: string
    reviews: ApiReview[]
  }[]
}
export interface ApiQueue {
  items: ApiCheck[]
  nextCursor: string | null
  counts: { needsReview: number; held: number; flagged: number; decided: number }
  now: string
}
export interface SaveResult {
  review: ApiReview
  clearance: 'clear' | 'held' | 'denied'
  integrations: { checkIn: 'not_connected'; notification: 'mock' | 'not_requested'; audit: 'database' }
}

export class ScreeningApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ScreeningApiError'
    this.status = status
  }
}
export async function screeningRequest<T>(fetchWithAuth: AuthFetch, path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, init)
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Your session could not be refreshed. Sign out and sign in again.',
      403: 'Security access required. Ask an administrator to assign the security role.',
      404: 'This screening check was not found.',
      409: 'Decision changed, please reload the latest decision before submitting again.',
    }
    let message = messages[response.status] ?? 'The screening service is unavailable. Please try again.'
    if (response.status === 400) {
      const body: unknown = await response.json().catch(() => null)
      if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') message = body.message
    }
    throw new ScreeningApiError(response.status, message)
  }
  return (await response.json()) as T
}

export function postReview(fetchWithAuth: AuthFetch, record: ScreeningRecord, draft: ReviewDraft): Promise<SaveResult> {
  if (!draft.note.trim() || draft.note.trim().length > 2000 || !draft.passportCompared)
    throw new Error('A note and passport comparison are required.')
  if (record.outcome === 'clear') throw new Error('A clear check cannot be reviewed.')
  const expectedRevision = Math.max(0, ...record.reviews.map((review) => review.revision ?? 0))
  return screeningRequest(fetchWithAuth, `/api/security/screenings/${encodeURIComponent(record.id)}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: draft.decision, note: draft.note.trim(), passportCompared: true, expectedRevision }),
  })
}

const matches: Record<ApiCheck['match'], Match> = { none: 'None', weak: 'Weak', probable: 'Probable', strong: 'Strong' }
export const mapReview = (review: ApiReview): Decision => ({ ...review, authorityNotifiedAt: review.authorityNotifiedAt ?? undefined })
export function mapQueueItem(check: ApiCheck, now: string): ScreeningRecord {
  return {
    id: check.id,
    runId: check.runId,
    passengerId: check.passengerId,
    watchlistEntryId: check.watchlistEntryId,
    name: check.name,
    displayName: check.name,
    triggerPoint: check.triggerPoint,
    outcome: check.outcome,
    occurredAt: check.occurredAt,
    match: matches[check.match],
    matchReason: check.matchReason,
    flight: check.flight,
    now,
    similarity: check.similarity === null ? 'Not recorded' : check.similarity.toFixed(2),
    comparison: [],
    booking: 'Not connected',
    bookedBy: 'Not connected',
    others: 'Not connected',
    listType: 'Not recorded',
    reason: 'Not recorded',
    listed: 'Not recorded',
    history: [],
    reviews: check.latestReview ? [mapReview(check.latestReview)] : [],
  }
}
export function mapCounts(queue: ApiQueue): Record<Filter, number> {
  return {
    'Needs review': queue.counts.needsReview,
    Held: queue.counts.held,
    Flagged: queue.counts.flagged,
    'Decided today': queue.counts.decided,
  }
}
function comparison(passenger: ApiIdentity, entry: ApiIdentity | null): Comparison[] {
  const text = (value: string | null | undefined) => value || 'Not recorded'
  const fullName = (identity: ApiIdentity | null) => (identity ? `${identity.firstName} ${identity.lastName}` : null)
  const passport = (identity: ApiIdentity | null) => (identity?.passportLast4 ? `•••• ${identity.passportLast4}` : 'Not recorded')
  return [
    ['Name', text(fullName(passenger)), text(fullName(entry))],
    ['Date of birth', text(passenger.dateOfBirth), text(entry?.dateOfBirth)],
    ['Nationality', text(passenger.nationality), text(entry?.nationality)],
    ['Passport', passport(passenger), passport(entry)],
    ['Gender', text(passenger.gender), text(entry?.gender)],
  ]
}
export function mapDetail(detail: ApiDetail): ScreeningRecord {
  const history: HistoryRow[] = []
  const historyReviews: (Decision | undefined)[] = []
  for (const check of detail.history) {
    history.push([
      formatDeparture(check.occurredAt, detail.now),
      sourceLabel(check.triggerPoint),
      matches[check.match],
      check.outcome === 'held' ? 'Held' : check.outcome === 'flagged' ? 'Flagged' : 'Clear',
      check.id === detail.id ? 'This check' : 'Screening check',
    ])
    historyReviews.push(undefined)
    if (check.id === detail.id) continue
    for (const review of [...check.reviews].sort((a, b) => a.revision - b.revision)) {
      history.push([
        formatDeparture(review.reviewedAt, detail.now),
        'Review',
        '—',
        review.decision === 'confirmed' ? 'Confirmed' : 'Released',
        `${review.by}: ${review.note}`,
      ])
      historyReviews.push(mapReview(review))
    }
  }
  return {
    ...mapQueueItem(detail, detail.now),
    comparison: comparison(detail.snapshot.passenger, detail.snapshot.entry),
    comparisonMatches: [
      detail.snapshot.passenger.firstName === detail.snapshot.entry?.firstName &&
        detail.snapshot.passenger.lastName === detail.snapshot.entry?.lastName,
      !!detail.snapshot.passenger.dateOfBirth && detail.snapshot.passenger.dateOfBirth === detail.snapshot.entry?.dateOfBirth,
      !!detail.snapshot.passenger.nationality && detail.snapshot.passenger.nationality === detail.snapshot.entry?.nationality,
      !!detail.snapshot.passenger.passportNumber && detail.snapshot.passenger.passportNumber === detail.snapshot.entry?.passportNumber,
      !!detail.snapshot.passenger.gender && detail.snapshot.passenger.gender === detail.snapshot.entry?.gender,
    ],
    booking: detail.booking.reference ?? 'Not connected',
    bookedBy: detail.booking.bookedBy ?? 'Not connected',
    others: detail.booking.others ?? 'Not connected',
    bookingSource: detail.booking.source,
    authority: detail.watchlist?.issuingAuthority ?? 'Not recorded',
    listType: detail.watchlist?.listType ?? 'Not recorded',
    reason: detail.watchlist?.reason ?? 'Not recorded',
    listed: detail.watchlist ? formatDeparture(detail.watchlist.listedAt, detail.now) : 'Not recorded',
    history,
    historyReviews,
    reviews: detail.reviews.map(mapReview),
  }
}
