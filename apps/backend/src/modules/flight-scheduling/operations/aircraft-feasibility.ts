// Pure position, overlap and turnaround rules for one aircraft's chain of flights. No database access and no clock:
// callers load the flights and decide the required turnaround, so Schedule Builder (assign) and Operations (reassign,
// delay cascade) share one implementation.

/** One flight in an aircraft's chain. Times are the current expected times (dep_at / arr_at). */
export interface AircraftLeg {
  /** null for a proposed flight that is not saved yet */
  flightId: string | null
  flightNumber: string
  origin: string
  /** Where the flight actually ends: actual_destination when diverted, otherwise the route destination. */
  destination: string
  scheduledDepAt: Date
  depAt: Date
  arrAt: Date
}

/** Minimum ground time, in minutes, an aircraft needs at an airport before its next departure. */
export type TurnaroundResolver = (airport: string) => number

export type FeasibilityViolation =
  | {
      kind: 'aircraft_position'
      rule: 'overlap'
      otherFlightId: string | null
      otherFlightNumber: string
      detail: string
    }
  | {
      kind: 'aircraft_position'
      rule: 'previous_ends_elsewhere' | 'next_starts_elsewhere'
      otherFlightId: string | null
      otherFlightNumber: string
      expectedAirport: string
      actualAirport: string
      detail: string
    }
  | {
      kind: 'turnaround_short'
      rule: 'turnaround_short'
      side: 'previous' | 'next'
      otherFlightId: string | null
      otherFlightNumber: string
      airport: string
      gapMinutes: number
      requiredMinutes: number
      shortByMinutes: number
      detail: string
    }

export interface FeasibilityResult {
  feasible: boolean
  violations: FeasibilityViolation[]
}

const MINUTE_MS = 60_000

function minutesBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MINUTE_MS)
}

function overlaps(a: AircraftLeg, b: AircraftLeg): boolean {
  return a.depAt < b.arrAt && b.depAt < a.arrAt
}

/**
 * Checks the link between two consecutive flights of one aircraft: the earlier must end where the later starts, with at
 * least the required turnaround in between. `side` says which neighbour `other` is, seen from the flight being checked.
 */
function checkLink(earlier: AircraftLeg, later: AircraftLeg, side: 'previous' | 'next', requiredTurnaround: TurnaroundResolver) {
  const other = side === 'previous' ? earlier : later
  const violations: FeasibilityViolation[] = []

  // In timetable order, but the later flight leaves before the earlier one has landed (typically after a delay).
  if (later.depAt < earlier.arrAt) {
    violations.push({
      kind: 'aircraft_position',
      rule: 'overlap',
      otherFlightId: other.flightId,
      otherFlightNumber: other.flightNumber,
      detail: `${later.flightNumber} departs before ${earlier.flightNumber} has arrived`,
    })
    return violations
  }

  if (earlier.destination !== later.origin) {
    violations.push(
      side === 'previous'
        ? {
            kind: 'aircraft_position',
            rule: 'previous_ends_elsewhere',
            otherFlightId: other.flightId,
            otherFlightNumber: other.flightNumber,
            expectedAirport: later.origin,
            actualAirport: earlier.destination,
            detail: `Previous flight ${earlier.flightNumber} ends at ${earlier.destination}, not ${later.origin}`,
          }
        : {
            kind: 'aircraft_position',
            rule: 'next_starts_elsewhere',
            otherFlightId: other.flightId,
            otherFlightNumber: other.flightNumber,
            expectedAirport: earlier.destination,
            actualAirport: later.origin,
            detail: `Next flight ${later.flightNumber} starts at ${later.origin}, not ${earlier.destination}`,
          },
    )
    // Turnaround is only meaningful at the same airport.
    return violations
  }

  const airport = later.origin
  const gapMinutes = minutesBetween(earlier.arrAt, later.depAt)
  const requiredMinutes = requiredTurnaround(airport)
  if (gapMinutes < requiredMinutes) {
    violations.push({
      kind: 'turnaround_short',
      rule: 'turnaround_short',
      side,
      otherFlightId: other.flightId,
      otherFlightNumber: other.flightNumber,
      airport,
      gapMinutes,
      requiredMinutes,
      shortByMinutes: requiredMinutes - gapMinutes,
      detail: `Turnaround at ${airport} is ${gapMinutes} min, short by ${requiredMinutes - gapMinutes} min (needs ${requiredMinutes})`,
    })
  }
  return violations
}

/**
 * Can `candidate` be flown by an aircraft whose other flights are `otherFlights`?
 * `otherFlights` must already exclude cancelled flights and the candidate itself.
 * Neighbours are chosen by scheduled departure, as the timetable is what fixes the order.
 */
export function checkAircraftFeasibility(
  candidate: AircraftLeg,
  otherFlights: readonly AircraftLeg[],
  requiredTurnaround: TurnaroundResolver,
): FeasibilityResult {
  const violations: FeasibilityViolation[] = []

  for (const other of otherFlights) {
    if (overlaps(candidate, other)) {
      violations.push({
        kind: 'aircraft_position',
        rule: 'overlap',
        otherFlightId: other.flightId,
        otherFlightNumber: other.flightNumber,
        detail: `Overlaps flight ${other.flightNumber} on the same aircraft`,
      })
    }
  }

  const ordered = byTimetable(otherFlights)
  const previous = ordered.filter((f) => f.scheduledDepAt < candidate.scheduledDepAt).at(-1)
  const next = ordered.find((f) => f.scheduledDepAt > candidate.scheduledDepAt)

  if (previous && !overlaps(previous, candidate)) {
    violations.push(...checkLink(previous, candidate, 'previous', requiredTurnaround))
  }
  if (next && !overlaps(candidate, next)) {
    violations.push(...checkLink(candidate, next, 'next', requiredTurnaround))
  }

  return { feasible: violations.length === 0, violations }
}

export interface PositionBreak {
  flightId: string | null
  flightNumber: string
  violation: Extract<FeasibilityViolation, { expectedAirport: string }>
}

/**
 * Flights whose previous flight on the aircraft ends somewhere else (typically after a diversion). Time problems are left to
 * the delay cascade, which knows which delay caused them.
 */
export function findPositionBreaks(chain: readonly AircraftLeg[]): PositionBreak[] {
  const ordered = byTimetable(chain)
  const breaks: PositionBreak[] = []
  for (let i = 1; i < ordered.length; i++) {
    const [earlier, later] = [ordered[i - 1], ordered[i]]
    if (later.depAt < earlier.arrAt || earlier.destination === later.origin) continue
    breaks.push({
      flightId: later.flightId,
      flightNumber: later.flightNumber,
      violation: {
        kind: 'aircraft_position',
        rule: 'previous_ends_elsewhere',
        otherFlightId: earlier.flightId,
        otherFlightNumber: earlier.flightNumber,
        expectedAirport: later.origin,
        actualAirport: earlier.destination,
        detail: `Previous flight ${earlier.flightNumber} ends at ${earlier.destination}, not ${later.origin}`,
      },
    })
  }
  return breaks
}

/** One later flight a delay breaks. `previousArrAt` is projected when the delay reached it through another broken flight. */
export interface CascadeBreak {
  flightId: string | null
  flightNumber: string
  rule: 'overlap' | 'turnaround_short'
  causeFlightId: string | null
  causeFlightNumber: string
  previousFlightId: string | null
  previousFlightNumber: string
  previousArrAt: Date
  previousArrivalProjected: boolean
  depAt: Date
  airport: string
  gapMinutes: number
  requiredMinutes: number
  shortByMinutes: number
  detail: string
}

/**
 * Iteration-03 cascade check: walks the aircraft's flights in timetable order from the delayed flight, comparing each flight's
 * current departure with the previous one's arrival plus the minimum turnaround. A broken flight cannot leave before the
 * aircraft is ready, so the walk carries that lateness forward (projected, never saved) and a delay longer than one gap still
 * reaches the flights behind it. The walk stops at the first flight that still connects, or where the chain changes airport.
 * Detects only; moving later flights is a staff decision (spec v2, section 16 q9).
 */
export function findDelayCascade(
  chain: readonly AircraftLeg[],
  delayedFlightId: string,
  requiredTurnaround: TurnaroundResolver,
): CascadeBreak[] {
  const ordered = byTimetable(chain)
  const start = ordered.findIndex((f) => f.flightId === delayedFlightId)
  if (start < 0) return []
  const cause = ordered[start]
  const breaks: CascadeBreak[] = []
  let previous = cause
  let previousArrAt = cause.arrAt
  let projected = false

  for (const later of ordered.slice(start + 1)) {
    if (previous.destination !== later.origin) break
    const requiredMinutes = requiredTurnaround(later.origin)
    const readyAt = new Date(previousArrAt.getTime() + requiredMinutes * MINUTE_MS)
    if (later.depAt >= readyAt) break

    const gapMinutes = minutesBetween(previousArrAt, later.depAt)
    const shortByMinutes = Math.ceil((readyAt.getTime() - later.depAt.getTime()) / MINUTE_MS)
    const rule = later.depAt < previousArrAt ? 'overlap' : 'turnaround_short'
    const arrival = `${previous.flightNumber} ${projected ? 'can arrive at the earliest' : 'arrives'} at ${previousArrAt.toISOString()}`
    breaks.push({
      flightId: later.flightId,
      flightNumber: later.flightNumber,
      rule,
      causeFlightId: cause.flightId,
      causeFlightNumber: cause.flightNumber,
      previousFlightId: previous.flightId,
      previousFlightNumber: previous.flightNumber,
      previousArrAt,
      previousArrivalProjected: projected,
      depAt: later.depAt,
      airport: later.origin,
      gapMinutes,
      requiredMinutes,
      shortByMinutes,
      detail:
        rule === 'overlap'
          ? `Delay of ${cause.flightNumber}: ${later.flightNumber} departs ${later.depAt.toISOString()} before ${arrival}`
          : `Delay of ${cause.flightNumber}: turnaround at ${later.origin} before ${later.flightNumber} is ${gapMinutes} min, ` +
            `short by ${shortByMinutes} min (needs ${requiredMinutes}; ${arrival})`,
    })

    // The earliest this flight could now leave and land, if nothing else changes.
    previous = later
    previousArrAt = new Date(readyAt.getTime() + (later.arrAt.getTime() - later.depAt.getTime()))
    projected = true
  }
  return breaks
}

function byTimetable(chain: readonly AircraftLeg[]): AircraftLeg[] {
  return [...chain].sort((a, b) => a.scheduledDepAt.getTime() - b.scheduledDepAt.getTime())
}
