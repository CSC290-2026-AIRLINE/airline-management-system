import type { screening_check, screening_review } from '@backend/db/generated/prisma/client'

export const triggers = ['booking', 'check_in', 'new_entry', 'entry_change', 'identity_change'] as const
export type Trigger = (typeof triggers)[number]
export type MatchLevel = 'none' | 'weak' | 'probable' | 'strong'
export type MatchReason = 'none' | 'similar_name' | 'name_and_dob' | 'passport_and_nationality'
export type Decision = 'confirmed' | 'false_positive'
export interface Identity {
  id?: string
  first_name: string
  last_name: string
  date_of_birth: Date | null
  nationality: string | null
  passport_number: string | null
  gender: string | null
}

export const nameKey = (first: string, last: string) => (first + last).replace(/[^A-Za-z0-9]/g, '').toUpperCase()
const passportKey = (value: string | null) => value?.replace(/[\s-]/g, '').toUpperCase() || null
const countryKey = (value: string | null) => value?.trim().toLowerCase() || null
const sameDob = (a: Date | null, b: Date | null) =>
  a !== null && b !== null && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)

export function classify(passenger: Identity, entry: Identity, similarity: number): { level: MatchLevel; reason: MatchReason } {
  if (
    passportKey(passenger.passport_number) &&
    passportKey(passenger.passport_number) === passportKey(entry.passport_number) &&
    countryKey(passenger.nationality) &&
    countryKey(passenger.nationality) === countryKey(entry.nationality)
  )
    return { level: 'strong', reason: 'passport_and_nationality' }
  const dobMatches = sameDob(passenger.date_of_birth, entry.date_of_birth)
  if (dobMatches && similarity >= 0.5) return { level: 'probable', reason: 'name_and_dob' }
  if (!dobMatches && similarity >= 0.6) return { level: 'weak', reason: 'similar_name' }
  return { level: 'none', reason: 'none' }
}

export function initialOutcome(level: MatchLevel, trigger: Trigger): 'clear' | 'flagged' | 'held' {
  if (level === 'none') return 'clear'
  return trigger === 'check_in' && (level === 'strong' || level === 'probable') ? 'held' : 'flagged'
}

export function snapshotIdentity(check: screening_check, entry = false): Identity {
  return entry
    ? {
        first_name: check.snap_entry_first_name ?? '',
        last_name: check.snap_entry_last_name ?? '',
        date_of_birth: check.snap_entry_date_of_birth,
        nationality: check.snap_entry_nationality,
        passport_number: check.snap_entry_passport,
        gender: check.snap_entry_gender,
      }
    : {
        id: check.passenger_id,
        first_name: check.snap_first_name,
        last_name: check.snap_last_name,
        date_of_birth: check.snap_date_of_birth,
        nationality: check.snap_nationality,
        passport_number: check.snap_passport,
        gender: check.snap_gender,
      }
}

// Passport-bearing identities never fall back to name/DOB when their passports disagree.
export function sameIdentity(a: Identity, b: Identity): boolean {
  if (
    a.id &&
    a.id === b.id &&
    nameKey(a.first_name, a.last_name) === nameKey(b.first_name, b.last_name) &&
    a.date_of_birth?.getTime() === b.date_of_birth?.getTime() &&
    countryKey(a.nationality) === countryKey(b.nationality) &&
    passportKey(a.passport_number) === passportKey(b.passport_number)
  )
    return true
  const aPassport = passportKey(a.passport_number)
  const bPassport = passportKey(b.passport_number)
  if (aPassport || bPassport)
    return !!aPassport && aPassport === bPassport && !!countryKey(a.nationality) && countryKey(a.nationality) === countryKey(b.nationality)
  return (
    !!nameKey(a.first_name, a.last_name) &&
    nameKey(a.first_name, a.last_name) === nameKey(b.first_name, b.last_name) &&
    sameDob(a.date_of_birth, b.date_of_birth)
  )
}

export type ReviewedCheck = screening_check & { screening_review: screening_review[] }
export function latestReview(reviews: screening_review[]): screening_review | undefined {
  return reviews.reduce<screening_review | undefined>(
    (latest, row) => (!latest || row.revision > latest.revision ? row : latest),
    undefined,
  )
}

// A confirmation on any check remains effective until that check is corrected.
export function decisionsByEntry(checks: ReviewedCheck[], identity: Identity): Map<string, screening_review> {
  const decisions = new Map<string, screening_review>()
  for (const check of checks) {
    if (!check.watchlist_entry_id || !sameIdentity(identity, snapshotIdentity(check))) continue
    const review = latestReview(check.screening_review)
    if (!review) continue
    const previous = decisions.get(check.watchlist_entry_id)
    if (
      !previous ||
      (review.decision === 'confirmed' && previous.decision !== 'confirmed') ||
      (review.decision === previous.decision && review.created_at > previous.created_at) ||
      (review.decision === previous.decision && review.created_at.getTime() === previous.created_at.getTime() && review.id > previous.id)
    )
      decisions.set(check.watchlist_entry_id, review)
  }
  return decisions
}

export function clearance(checks: ReviewedCheck[], identity: Identity): 'clear' | 'held' | 'denied' {
  const decisions = decisionsByEntry(checks, identity)
  if ([...decisions.values()].some((review) => review.decision === 'confirmed')) return 'denied'
  return checks.some(
    (check) => check.outcome === 'held' && !latestReview(check.screening_review) && sameIdentity(identity, snapshotIdentity(check)),
  )
    ? 'held'
    : 'clear'
}

export function bangkokDay(now: Date): { start: Date; end: Date } {
  const local = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const start = new Date(`${local}T00:00:00+07:00`)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}
