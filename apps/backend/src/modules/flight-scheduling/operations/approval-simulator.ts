import { formatLocal } from '../local-time'

// The simulated approver in auto mode. It follows the airport's approval policy: no departure in the curfew, and no more than
// max_departure_per_hour departures in a local clock hour. The schema fixes the answers (approved, a time offered, rejected
// with a reason) but not when each applies, so the rules here are an assumption, kept in this one file:
//   - the requested time passes both rules: approved;
//   - otherwise the next times (15-minute steps, up to 24 hours later) that do pass are offered, as slots or as one window
//     depending on the policy's offer_style;
//   - if no time in the next 24 hours passes: rejected as no_slot_available.

export interface SimulatorPolicy {
  /** Minutes after local midnight; both null means no curfew. The curfew may wrap midnight. */
  curfewStartMin: number | null
  curfewEndMin: number | null
  maxPerHour: number | null
  offerStyle: 'window' | 'slots'
}

export interface Offer {
  starts_at: Date
  ends_at?: Date
}

export type Decision =
  | { status: 'approved' }
  | { status: 'alternative_offered'; note: string; offers: Offer[] }
  | { status: 'rejected'; reason: 'no_slot_available'; note: string }

const STEP_MS = 15 * 60_000
const SEARCH_STEPS = 96
const SLOT_COUNT = 3
const WINDOW_MAX_STEPS = 16

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** `others` are the other departures from the same airport around the requested time. */
export function decide(policy: SimulatorPolicy, dep: Date, timeZone: string, others: Date[]): Decision {
  const local = (d: Date) => formatLocal(d, timeZone)
  const minuteOfDay = (d: Date) => Number(local(d).slice(11, 13)) * 60 + Number(local(d).slice(14, 16))
  const perHour = new Map<string, number>()
  for (const d of others) perHour.set(local(d).slice(0, 13), (perHour.get(local(d).slice(0, 13)) ?? 0) + 1)

  const { curfewStartMin: start, curfewEndMin: end, maxPerHour } = policy
  const problem = (d: Date): string | null => {
    if (start !== null && end !== null) {
      const m = minuteOfDay(d)
      if (start < end ? m >= start && m < end : m >= start || m < end)
        return `departure at ${local(d).slice(11)} falls in the curfew ${hhmm(start)}-${hhmm(end)}`
    }
    if (maxPerHour !== null && (perHour.get(local(d).slice(0, 13)) ?? 0) >= maxPerHour) {
      return `the hour of ${local(d).slice(11, 13)}:00 already has ${maxPerHour} departures`
    }
    return null
  }

  const why = problem(dep)
  if (why === null) return { status: 'approved' }

  const first = Math.floor(dep.getTime() / STEP_MS) * STEP_MS + STEP_MS
  const valid: Date[] = []
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const candidate = new Date(first + i * STEP_MS)
    if (problem(candidate) === null) valid.push(candidate)
  }
  if (valid.length === 0)
    return { status: 'rejected', reason: 'no_slot_available', note: `Not approved: ${why}, and no time in the next 24 hours is free` }

  if (policy.offerStyle === 'slots') {
    return {
      status: 'alternative_offered',
      note: `Not approved: ${why}`,
      offers: valid.slice(0, SLOT_COUNT).map((starts_at) => ({ starts_at })),
    }
  }
  // One window: the first free time and the free times that follow it without a gap.
  let last = 0
  while (last + 1 < valid.length && last + 1 < WINDOW_MAX_STEPS && valid[last + 1].getTime() - valid[last].getTime() === STEP_MS) last++
  // A window needs an end after its start, so a single free time is offered as a slot.
  const offers: Offer[] = last === 0 ? [{ starts_at: valid[0] }] : [{ starts_at: valid[0], ends_at: valid[last] }]
  return { status: 'alternative_offered', note: `Not approved: ${why}`, offers }
}
