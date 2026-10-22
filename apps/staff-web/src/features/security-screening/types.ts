export type Match = 'Probable' | 'Strong' | 'Weak' | 'None'
export type Status = 'Held' | 'Flagged' | 'Released' | 'Confirmed'
export type Filter = 'Needs review' | 'Held' | 'Flagged' | 'Decided today'
export type Sort = 'Nearest departure' | 'Waiting longest' | 'Strongest match'
export type Comparison = [field: string, passenger: string, entry: string]
export type HistoryRow = [when: string, from: string, match: string, outcome: string, note: string]
export type TriggerPoint = 'booking' | 'check_in' | 'new_entry' | 'entry_change' | 'identity_change'
export type ScreeningOutcome = 'clear' | 'flagged' | 'held'
export type ReviewDecision = 'confirmed' | 'false_positive'
export type MatchReason = 'passport_and_nationality' | 'passport' | 'name_and_dob' | 'similar_name' | 'none'
export interface ReviewDraft {
  decision: ReviewDecision
  note: string
  passportCompared: boolean
}
export interface Decision {
  readonly id: string
  readonly decision: ReviewDecision
  readonly note: string
  readonly by: string
  readonly reviewedAt: string
  readonly passportCompared: boolean
  readonly authorityNotifiedAt?: string
}
export interface ScreeningRecord {
  readonly id: string
  readonly runId: string
  readonly passengerId: string
  readonly watchlistEntryId: string | null
  readonly triggerPoint: TriggerPoint
  readonly outcome: ScreeningOutcome
  readonly occurredAt: string
  name: string
  displayName: string
  match: Match
  readonly matchReason: MatchReason
  readonly flight: { id: string; label: string; departureAt: string }
  similarity: string
  readonly comparison: readonly Comparison[]
  booking: string
  bookedBy: string
  others: string
  listType: string
  reason: string
  listed: string
  readonly history: readonly HistoryRow[]
  readonly reviews: readonly Decision[]
}
