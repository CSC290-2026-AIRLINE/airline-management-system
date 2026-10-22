export type Match = 'Probable' | 'Strong' | 'Weak'
export type Status = 'Held' | 'Flagged' | 'Released' | 'Confirmed'
export type Filter = 'Needs review' | 'Held' | 'Flagged' | 'Decided today'
export type Sort = 'Nearest departure' | 'Waiting longest' | 'Strongest match'
export type Comparison = [field: string, passenger: string, entry: string]
export type HistoryRow = [when: string, from: string, match: string, outcome: string, note: string]
export interface Decision {
  status: 'Released' | 'Confirmed'
  note: string
  by: string
  at: string
}
export interface ScreeningRecord {
  id: string
  name: string
  displayName: string
  source: string
  status: Status
  match: Match
  flight: string
  departs: string
  departureOrder: number
  since: string
  waitingOrder: number
  remaining?: string
  urgent?: boolean
  similarity: string
  comparison: Comparison[]
  booking: string
  bookedBy: string
  others: string
  listType: string
  reason: string
  listed: string
  history: HistoryRow[]
  decisions: Decision[]
}
