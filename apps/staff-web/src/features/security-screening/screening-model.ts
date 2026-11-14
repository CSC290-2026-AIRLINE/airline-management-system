import type { Decision, Filter, HistoryRow, ReviewDraft, ScreeningRecord, Sort, Status, TriggerPoint } from './types'

// The prototype uses one simulation clock, independent of the computer's wall clock.
export const simulationNow = '2026-11-05T08:30:00+07:00'
const zone = 'Asia/Bangkok'
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
const shortDateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: '2-digit', month: 'short' })

export function formatTime(value: string): string {
  return timeFormat.format(new Date(value))
}
export function isSimulationToday(value: string, now = simulationNow): boolean {
  return dayFormat.format(new Date(value)) === dayFormat.format(new Date(now))
}
export function formatDeparture(value: string, now = simulationNow): string {
  return `${isSimulationToday(value, now) ? 'Today' : shortDateFormat.format(new Date(value))} ${formatTime(value)}`
}
export function formatOccurredAt(value: string, now = simulationNow): string {
  return isSimulationToday(value, now) ? formatTime(value) : shortDateFormat.format(new Date(value))
}
export function remainingTime(record: ScreeningRecord, now = record.now ?? simulationNow): string {
  const minutes = Math.ceil((Date.parse(record.flight.departureAt) - Date.parse(now)) / 60000)
  return minutes > 0 ? `in ${Math.floor(minutes / 60)} h ${minutes % 60} m` : 'Departed'
}
export function isUrgent(record: ScreeningRecord, now = record.now ?? simulationNow): boolean {
  const difference = Date.parse(record.flight.departureAt) - Date.parse(now)
  return !latestReview(record) && difference > 0 && difference <= 3 * 60 * 60 * 1000
}
export function sourceLabel(trigger: TriggerPoint): string {
  const labels: Record<TriggerPoint, string> = {
    booking: 'booking',
    check_in: 'check-in',
    new_entry: 'new entry',
    entry_change: 'entry change',
    identity_change: 'identity change',
  }
  return labels[trigger]
}
export function compareReviews(a: Decision, b: Decision): number {
  return a.revision !== undefined && b.revision !== undefined && a.revision !== b.revision
    ? a.revision - b.revision
    : Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt)
}
export function latestReview(record: ScreeningRecord): Decision | undefined {
  return record.reviews.reduce<Decision | undefined>(
    (latest, review) => (!latest || compareReviews(latest, review) <= 0 ? review : latest),
    undefined,
  )
}
export function reviewStatus(review: Decision): 'Released' | 'Confirmed' {
  return review.decision === 'confirmed' ? 'Confirmed' : 'Released'
}
export function displayStatus(record: ScreeningRecord): Status | 'Clear' {
  const review = latestReview(record)
  return review ? reviewStatus(review) : record.outcome === 'held' ? 'Held' : record.outcome === 'flagged' ? 'Flagged' : 'Clear'
}
export function isPending(record: ScreeningRecord): boolean {
  return record.outcome !== 'clear' && !latestReview(record)
}
export function decisionLabel(record: ScreeningRecord, review: Decision): string {
  return review.decision === 'confirmed'
    ? review.authorityNotifiedAt
      ? 'Confirmed · authority notified'
      : 'Confirmed · check-in denied'
    : record.outcome === 'held'
      ? 'Released · not the same person'
      : 'Released · flag cleared'
}
export function reviewHistory(record: ScreeningRecord): HistoryRow[] {
  return [
    ...record.history,
    ...[...record.reviews]
      .sort(compareReviews)
      .map((review): HistoryRow => [
        formatDeparture(review.reviewedAt, record.now),
        'Review',
        '—',
        reviewStatus(review),
        `${review.by}: ${review.note}`,
      ]),
  ]
}
export function queueCounts(records: readonly ScreeningRecord[], now = simulationNow): Record<Filter, number> {
  const pending = records.filter(isPending)
  return {
    'Needs review': pending.length,
    Held: pending.filter((record) => record.outcome === 'held').length,
    Flagged: pending.filter((record) => record.outcome === 'flagged').length,
    'Decided today': records.filter((record) => {
      const review = latestReview(record)
      return review && isSimulationToday(review.reviewedAt, now)
    }).length,
  }
}
export function selectQueue(
  records: readonly ScreeningRecord[],
  filter: Filter,
  query: string,
  sort: Sort,
  now = simulationNow,
): ScreeningRecord[] {
  const needle = query.trim().toLowerCase()
  return records
    .filter((record) => {
      const review = latestReview(record)
      const matchesFilter =
        filter === 'Decided today'
          ? !!review && isSimulationToday(review.reviewedAt, now)
          : isPending(record) && (filter === 'Needs review' || displayStatus(record) === filter)
      return matchesFilter && `${record.name} ${record.flight.label}`.toLowerCase().includes(needle)
    })
    .sort((a, b) => {
      const departure = Date.parse(a.flight.departureAt) - Date.parse(b.flight.departureAt)
      if (sort === 'Waiting longest') return Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || departure
      if (sort === 'Strongest match')
        return { Strong: 0, Probable: 1, Weak: 2, None: 3 }[a.match] - { Strong: 0, Probable: 1, Weak: 2, None: 3 }[b.match] || departure
      return departure
    })
}
export function appendReview(record: ScreeningRecord, draft: ReviewDraft, now = simulationNow): ScreeningRecord {
  if (record.outcome === 'clear') throw new Error('A clean check cannot be reviewed.')
  if (!draft.note.trim() || !draft.passportCompared) throw new Error('A review requires a note and passport comparison.')
  if (Date.parse(now) < Date.parse(record.occurredAt)) throw new Error('A review cannot predate the screening check.')
  const latest = latestReview(record)
  if (latest && Date.parse(now) < Date.parse(latest.reviewedAt)) throw new Error('A new review cannot predate the latest review.')
  const review: Decision = {
    id: crypto.randomUUID(),
    decision: draft.decision,
    note: draft.note.trim(),
    passportCompared: true,
    by: 'Demo reviewer',
    reviewedAt: now,
    ...(draft.decision === 'confirmed' ? { authorityNotifiedAt: now } : {}),
  }
  return { ...record, reviews: [...record.reviews, review] }
}
