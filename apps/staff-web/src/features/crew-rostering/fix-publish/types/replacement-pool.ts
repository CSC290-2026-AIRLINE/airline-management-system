/**
 * The crew who can be swapped into a break, and the four checks that decide it.
 *
 * This pool is deliberately separate from `MOCK_CREW`. That list is the crew already
 * on this roster run, and it feeds `autoAssign`; widening it would change what step 2
 * produces and break the breaks step 2 is supposed to show. The pool is everyone else
 * based at BKK who could legally take a seat — which is exactly the question the
 * replacement picker asks.
 *
 * The checks are the four the mockups print on a candidate card: qualified and free,
 * rest, flight hours inside the 28-day window, and no overlapping leg. A candidate
 * that fails one is still listed, because an operator needs to see *why* someone they
 * expected to be on the list is not.
 */
import { MOCK_FLIGHTS } from '../../build-pairings/types/mock-data'
import { formatTime, minutesBetween } from '../../build-pairings/types/format'
import { CREW_REPORT_LEAD_MINUTES, RULE_LIMITS } from '../../assign-crew/types/crew-engine'
import { DESTINATION_LANGUAGES, POLICE_PER_INTERNATIONAL_LEG, ROSTER_AIRCRAFT_TYPE } from '../../assign-crew/types/mock-data'
import type { CrewMember, IsoInstant, LegAssignment, ReplacementCandidate, ReplacementSet } from './types'

/**
 * A crew member who is available to be brought in.
 *
 * The three extra fields are the things a real crew record already knows but the
 * roster run does not carry: hours flown before the window, when they last landed,
 * and the legs they are committed to elsewhere in the operation.
 */
export interface PoolMember extends CrewMember {
  /** Flight hours already flown inside the 28-day window, before this roster run. */
  baselineHours: number
  /** When they last landed, used to show the rest they would bring to a leg. */
  previousDutyEnd: IsoInstant
  /** Legs they are already committed to elsewhere, which is what makes them overlap. */
  busyFlightIds: readonly string[]
}

/**
 * The pool.
 *
 * Sizes are chosen so the mockups' picker states are reachable without faking a
 * result: two police clear every check, one busts the 100 h window and one overlaps
 * another leg. The captains are arranged so exactly one legal captain is free while
 * `REST_SHORT` is open, and exactly one again after `P. Thongdee` has taken P-102.
 */
export const REPLACEMENT_POOL: readonly PoolMember[] = [
  // Police. Two of the four clear FD210; J. Prasert busts rule 3, K. Sombat is
  // already on FD511.
  {
    id: 'POOL-01',
    name: 'T. Wongsa',
    fullName: 'Thana Wongsa',
    role: 'police',
    nationality: 'TH',
    languages: ['th', 'en'],
    typeRatings: [],
    unavailableRanges: [],
    baselineHours: 62.75,
    previousDutyEnd: '2026-09-14T16:30:00.000Z',
    busyFlightIds: [],
  },
  {
    id: 'POOL-02',
    name: 'A. Rungrot',
    fullName: 'Anon Rungrot',
    role: 'police',
    nationality: 'TH',
    languages: ['th', 'en'],
    typeRatings: [],
    unavailableRanges: [],
    baselineHours: 88.25,
    previousDutyEnd: '2026-09-14T17:30:00.000Z',
    busyFlightIds: [],
  },
  {
    id: 'POOL-03',
    name: 'J. Prasert',
    fullName: 'Jira Prasert',
    role: 'police',
    nationality: 'TH',
    languages: ['th', 'en'],
    typeRatings: [],
    unavailableRanges: [],
    baselineHours: 97.5,
    previousDutyEnd: '2026-09-14T15:30:00.000Z',
    busyFlightIds: [],
  },
  {
    id: 'POOL-04',
    name: 'K. Sombat',
    fullName: 'Kanok Sombat',
    role: 'police',
    nationality: 'TH',
    languages: ['th', 'en'],
    typeRatings: [],
    // Booked with another station for the Tokyo morning. Held as an unavailability
    // rather than a committed flight because the booking is not on this roster, and
    // pointing it at FD511 would not overlap the seat anyway — that pairing is a day
    // later.
    unavailableRanges: range('2026-09-15T03:00:00.000Z', '2026-09-15T12:00:00.000Z'),
    baselineHours: 70,
    previousDutyEnd: '2026-09-14T16:30:00.000Z',
    busyFlightIds: [],
  },
  // Pilots. N. Srisai is committed to FD511 elsewhere, so while `REST_SHORT` is open
  // P. Thongdee is the only legal captain for the seat. P. Thongdee's own gap that
  // evening is what makes the sick call on FD211 come back to N. Srisai.
  {
    id: 'POOL-05',
    name: 'P. Thongdee',
    fullName: 'Prasit Thongdee',
    role: 'captain',
    nationality: 'TH',
    languages: ['th', 'en'],
    typeRatings: [ROSTER_AIRCRAFT_TYPE],
    // Off duty for the P-101 evening turn. He is the fix for FD511, which is a day
    // later, so this costs the roster nothing and stops him being offered a leg he
    // would have to crew on top of a pairing he is already running.
    unavailableRanges: range('2026-09-15T10:00:00.000Z', '2026-09-15T16:30:00.000Z'),
    baselineHours: 41.5,
    previousDutyEnd: '2026-09-14T12:00:00.000Z',
    busyFlightIds: [],
  },
  {
    id: 'POOL-06',
    name: 'N. Srisai',
    fullName: 'Nattapong Srisai',
    role: 'captain',
    nationality: 'TH',
    languages: ['th', 'en'],
    typeRatings: [ROSTER_AIRCRAFT_TYPE],
    unavailableRanges: [],
    baselineHours: 33,
    previousDutyEnd: '2026-09-14T18:30:00.000Z',
    busyFlightIds: ['FL-511'],
  },
  // Local crew. Two of the four speak Korean, which is what FD511 is short of.
  {
    id: 'POOL-07',
    name: 'J. Park',
    fullName: 'Jae-won Park',
    role: 'local',
    nationality: 'KR',
    languages: ['ko', 'en'],
    typeRatings: [],
    unavailableRanges: [],
    baselineHours: 18.25,
    previousDutyEnd: '2026-09-15T04:30:00.000Z',
    busyFlightIds: [],
  },
  {
    id: 'POOL-08',
    name: 'S. Kwon',
    fullName: 'Seong-min Kwon',
    role: 'local',
    nationality: 'KR',
    languages: ['ko', 'en'],
    typeRatings: [],
    unavailableRanges: [],
    baselineHours: 26,
    previousDutyEnd: '2026-09-15T05:00:00.000Z',
    busyFlightIds: [],
  },
]

function range(start: IsoInstant, end: IsoInstant) {
  return [{ start, end }]
}

interface Window {
  start: number
  end: number
}

function dutyWindow(leg: { departureAt: IsoInstant; arrivalAt: IsoInstant }): Window {
  return {
    start: new Date(leg.departureAt).getTime() - CREW_REPORT_LEAD_MINUTES * 60_000,
    end: new Date(leg.arrivalAt).getTime(),
  }
}

function overlaps(a: Window, b: Window): boolean {
  return a.start < b.end && b.start < a.end
}

/** Every seat `member` already holds in the run being fixed. */
function seatsIn(assignments: readonly LegAssignment[], memberId: string) {
  return assignments.filter((assignment) => crewOn(assignment).some((seat) => seat.id === memberId))
}

function crewOn(assignment: LegAssignment): CrewMember[] {
  return [
    ...(assignment.captain ? [assignment.captain] : []),
    ...(assignment.firstOfficer ? [assignment.firstOfficer] : []),
    ...assignment.cabinCrew,
    ...assignment.localCrew,
    ...assignment.police,
  ]
}

function blockedByUnavailability(member: CrewMember, window: Window): boolean {
  return member.unavailableRanges.some((range) =>
    overlaps({ start: new Date(range.start).getTime(), end: new Date(range.end).getTime() }, window),
  )
}

/** `Overlaps FD511` needs a flight number, so the pool stores leg ids and we look them up. */
function busyFlightNumber(member: PoolMember, window: Window): string | null {
  for (const flightId of member.busyFlightIds) {
    const flight = MOCK_FLIGHTS.find((candidate) => candidate.id === flightId)
    if (flight && overlaps(dutyWindow(flight), window)) return flight.flightNumber
  }
  return null
}

/**
 * Rest the member would bring to `reportAt`: from their last landing before it.
 *
 * Only landings that have already happened count. Taking the latest landing anywhere
 * in the run would let a leg they fly *after* this one push the figure negative, which
 * is how a perfectly rested candidate ends up reading `Rest -55 h`.
 */
function restBefore(member: PoolMember, reportAt: number, assignments: readonly LegAssignment[]): number {
  const before = seatsIn(assignments, member.id)
    .map((assignment) => new Date(assignment.leg.arrivalAt).getTime())
    .filter((arrival) => arrival <= reportAt)
  const lastLanding = before.length > 0 ? Math.max(...before) : new Date(member.previousDutyEnd).getTime()
  return (reportAt - lastLanding) / 60_000
}

function flownOnRun(assignments: readonly LegAssignment[], memberId: string): number {
  return seatsIn(assignments, memberId).reduce(
    (total, assignment) => total + minutesBetween(assignment.leg.departureAt, assignment.leg.arrivalAt),
    0,
  )
}

/**
 * What the seat needs, independent of who is being considered for it.
 */
export interface SeatTarget {
  role: CrewMember['role']
  /** The language a local-crew seat has to speak. Only set for `local`. */
  language?: string
  /** Copy for the sentence above the list, e.g. `Add one available police officer`. */
  instruction: string
  /** How the noun reads in the count line, `2 legal police officers available`. */
  noun: string
  /**
   * How the count is phrased. `legal` counts the ones who clear every rule; `ofTotal`
   * counts out of everybody in that role, which is the more useful number when most
   * of them simply are not the right shape for the seat.
   */
  availability: 'legal' | 'ofTotal'
  /** What to say under the list when nobody clears every check. */
  blockedNote: string
}

/**
 * What the seat is called in the count line, plural, per role.
 *
 * A rest break can be about any seat, not just the captain, so the noun follows the
 * break rather than being baked into the rest rule.
 */
const SEAT_NOUNS: Record<CrewMember['role'], string> = {
  captain: 'captains',
  first_officer: 'first officers',
  cabin: 'cabin crew members',
  local: 'local crew members',
  police: 'police officers',
}

/**
 * Everyone who could take the seat, with their four checks.
 *
 * Two kinds of people are left out entirely: anyone already holding a seat on this leg,
 * because offering them would be offering the current state back, and anyone named in
 * `blockedIds`. The second is how a sick call keeps its own absentee out of the list —
 * the rules would happily pass them, but they are the reason the seat is empty.
 */
export function replacementCandidates(
  target: SeatTarget,
  leg: LegAssignment['leg'],
  assignments: readonly LegAssignment[],
  crew: readonly PoolMember[],
  blockedIds: readonly string[] = [],
): ReplacementSet {
  const window = dutyWindow(leg)
  const reportAt = window.start
  const blockMinutes = minutesBetween(leg.departureAt, leg.arrivalAt)

  const here = assignments.find((assignment) => assignment.leg.flightId === leg.flightId)
  const alreadyHere = new Set(here ? crewOn(here).map((seat) => seat.id) : [])
  const pool = crew.filter((member) => member.role === target.role && !alreadyHere.has(member.id) && !blockedIds.includes(member.id))

  const candidates: ReplacementCandidate[] = pool.map((member) => {
    const qualified =
      target.language !== undefined
        ? member.languages.includes(target.language)
        : !isPilot(member.role) || member.typeRatings.includes(ROSTER_AIRCRAFT_TYPE)
    const unavailable = blockedByUnavailability(member, window)
    const overlapping = busyFlightNumber(member, window)
    const rest = restBefore(member, reportAt, assignments)
    const flown = member.baselineHours + flownOnRun(assignments, member.id) / 60 + blockMinutes / 60
    const bustsHours = flown > RULE_LIMITS.maxFlightHoursPerWindow
    const shortRest = rest < RULE_LIMITS.minRestHours * 60

    const checks = [
      {
        label: qualified && !unavailable ? 'Eligible & available' : unavailable ? 'Unavailable' : 'Not eligible',
        ok: qualified && !unavailable,
        reason: unavailable
          ? `Not free for ${leg.flightNumber} (${formatTime(leg.departureAt)}–${formatTime(leg.arrivalAt)}).`
          : qualified
            ? undefined
            : 'Does not meet the seat requirement.',
      },
      {
        label: `Rest ${Math.round(rest / 60)} h`,
        ok: !shortRest,
        reason: shortRest ? `Only ${Math.round(rest / 60)} h rest, needs ${RULE_LIMITS.minRestHours} h.` : undefined,
      },
      // The hours chip changes shape when it is the thing about to fail: `88.25 / 100 h`
      // while it passes, `70.0 → 71.25 of 100` when the projection is the warning.
      bustsHours
        ? {
            label: 'Would exceed 100 h',
            ok: false,
            reason: `Would go over ${RULE_LIMITS.maxFlightHoursPerWindow} flight hours in ${RULE_LIMITS.flightHourWindowDays} days (rule 3).`,
          }
        : { label: `${round(flown - blockMinutes / 60)} / ${RULE_LIMITS.maxFlightHoursPerWindow} h`, ok: true },
      overlapping
        ? { label: `Overlaps ${overlapping}`, ok: false, reason: `Would overlap ${overlapping} (rule 6).` }
        : { label: 'No overlap', ok: true },
    ]

    return { member, checks, allowed: checks.every((check) => check.ok) }
  })

  const allowedCount = candidates.filter((candidate) => candidate.allowed).length

  return {
    availableLabel: `${allowedCount} legal ${target.noun} available`,
    allowedCount,
    instruction: target.instruction,
    blockedNote: target.blockedNote,
    candidates,
  }
}

function round(hours: number): number {
  return Math.round(hours * 100) / 100
}

function isPilot(role: CrewMember['role']): boolean {
  return role === 'captain' || role === 'first_officer'
}

/**
 * The seat a rule names, and the copy that describes swapping somebody into it.
 *
 * `role` overrides the rule's default seat: `REST_SHORT` is written against whoever
 * is short of rest, which is not always the captain.
 */
export function seatTargetFor(code: string, leg: LegAssignment['leg'], role?: CrewMember['role']): SeatTarget | null {
  const language = DESTINATION_LANGUAGES[leg.destination]
  switch (code) {
    case 'POLICE_MIN':
      return {
        role: 'police',
        instruction: `Add one available police officer so ${leg.flightNumber} has ${POLICE_PER_INTERNATIONAL_LEG} of ${POLICE_PER_INTERNATIONAL_LEG}.`,
        noun: SEAT_NOUNS.police,
        availability: 'legal',
        blockedNote: 'No officer on the roster is free, rested and inside the 28-day window for this leg.',
      }
    case 'NO_LOCAL_CREW':
      return {
        role: 'local',
        language: language?.code,
        instruction: `Swap a ${language?.label ?? 'local'}-speaking crew member onto ${leg.flightNumber}. Everyone else stays.`,
        noun: SEAT_NOUNS.local,
        availability: 'ofTotal',
        blockedNote: `No ${language?.label ?? 'local'}-speaking crew member is free for ${leg.flightNumber}.`,
      }
    case 'REST_SHORT':
      return {
        role: role ?? 'captain',
        instruction: 'Swap the seat in on the whole pairing. Match the seat, rest and duty limits.',
        noun: SEAT_NOUNS[role ?? 'captain'],
        availability: 'legal',
        blockedNote: 'Nobody based at BKK is rested, rated and free for the whole pairing.',
      }
    case 'NO_LEGAL_CREW':
    case 'SICK_CALL': {
      const seat = role ?? 'captain'
      return {
        role: seat,
        instruction: `Add an ${ROSTER_AIRCRAFT_TYPE}-rated ${seat === 'captain' ? 'captain' : 'crew member'} based at BKK who is free from ${formatTime(leg.departureAt)} to ${formatTime(leg.arrivalAt)}.`,
        noun: SEAT_NOUNS[seat],
        availability: 'legal',
        blockedNote: `Every ${SEAT_NOUNS[seat].replace(/s$/, '')} fails at least one law rule, so nobody can be added.`,
      }
    }
    default:
      return null
  }
}
