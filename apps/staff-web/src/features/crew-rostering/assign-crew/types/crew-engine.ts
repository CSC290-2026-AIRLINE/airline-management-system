/**
 * Auto-assign and rule checking for the assign-crew page.
 *
 * Two pure functions do all the thinking: `autoAssign` decides who flies each leg,
 * `evaluateRules` then judges the result. Keeping them out of the components means
 * the table, the banner and the break cards can never disagree about a break,
 * because every one of them reads the same derived list.
 */
import { formatDay, formatRoute, formatTime, minutesBetween } from '../../build-pairings/types/format'
import {
  AIRPORT_CITIES,
  AIRPORT_COUNTRIES,
  CABIN_CREW_PER_LEG,
  DESTINATION_LANGUAGES,
  POLICE_PER_INTERNATIONAL_LEG,
  ROSTER_AIRCRAFT_TYPE,
} from './mock-data'
import type {
  AssignmentSummary,
  CommittedLeg,
  CommittedPairing,
  CrewMember,
  CrewRole,
  IsoInstant,
  LegAssignment,
  RuleBreak,
  RuleDefinition,
} from './types'

/**
 * Minutes before wheels-up that crew report for duty. Rest is measured from the
 * previous landing to this report time, which is how the roster brief states it.
 */
export const CREW_REPORT_LEAD_MINUTES = 60

export const RULE_LIMITS = {
  maxFlightsPerDutyDay: 4,
  maxDutyHoursPerDutyDay: 13,
  minRestHours: 10,
  maxFlightHoursPerWindow: 100,
  flightHourWindowDays: 28,
} as const

/** The six rules shown in the "Rules used" card, numbered as the mockups number them. */
export const ROSTER_RULES: readonly RuleDefinition[] = [
  { number: 1, code: 'DUTY_FLIGHTS', label: 'Max 4 flights or 13 h per duty', severity: 'law' },
  { number: 2, code: 'REST_SHORT', label: 'Min 10 h rest between duties', severity: 'law' },
  { number: 3, code: 'FLIGHT_HOURS_28D', label: 'Max 100 flight hours per 28 days', severity: 'law' },
  {
    number: 4,
    code: 'NO_LOCAL_CREW',
    label: 'At least 1 local crew who speaks the destination language',
    severity: 'company',
  },
  { number: 5, code: 'POLICE_MIN', label: '2 police on international flights', severity: 'company' },
  { number: 6, code: 'DOUBLE_BOOKED', label: 'No overlapping flights for one person', severity: 'law' },
]

/** The closing line under the rules grid. */
export const RULES_FOOTNOTE =
  'Each A320 leg needs 1 captain, 1 first officer and 4 cabin crew (Feature 9), all with a valid licence; ' +
  'pilots need an A320 type rating. Rules 1, 2, 3 and 6 are law: a break must be fixed with a swap. ' +
  'Rules 4 and 5 are company rules: a break can be overridden with a written reason.'

interface Window {
  start: number
  end: number
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

function dutyWindow(leg: CommittedLeg): Window {
  return {
    start: new Date(leg.departureAt).getTime() - CREW_REPORT_LEAD_MINUTES * 60_000,
    end: new Date(leg.arrivalAt).getTime(),
  }
}

/** Report time as an ISO instant, for display and for the rest calculation. */
export function reportTime(leg: CommittedLeg): IsoInstant {
  return new Date(new Date(leg.departureAt).getTime() - CREW_REPORT_LEAD_MINUTES * 60_000).toISOString()
}

export function isInternational(leg: CommittedLeg): boolean {
  return AIRPORT_COUNTRIES[leg.origin] !== AIRPORT_COUNTRIES[leg.destination]
}

function speaksDestination(member: CrewMember, destination: string): boolean {
  const language = DESTINATION_LANGUAGES[destination]
  return language ? member.languages.includes(language.code) : false
}

function assignedCrew(assignment: LegAssignment): CrewMember[] {
  return [
    ...(assignment.captain ? [assignment.captain] : []),
    ...(assignment.firstOfficer ? [assignment.firstOfficer] : []),
    ...assignment.cabinCrew,
    ...assignment.localCrew,
    ...assignment.police,
  ]
}

function overlaps(windows: readonly Window[] | undefined, target: Window): boolean {
  return (windows ?? []).some((window) => window.start < target.end && target.start < window.end)
}

/** An unavailable range arrives as ISO strings; overlap maths wants epoch millis. */
function toWindow(range: { start: string; end: string }): Window {
  return { start: new Date(range.start).getTime(), end: new Date(range.end).getTime() }
}

/** True when the member is qualified for this leg and not already committed to it. */
function isAvailable(member: CrewMember, busy: Map<string, Window[]>, window: Window): boolean {
  if (member.role === 'captain' || member.role === 'first_officer') {
    if (!member.typeRatings.includes(ROSTER_AIRCRAFT_TYPE)) return false
  }
  if (overlaps(busy.get(member.id), window)) return false
  return !member.unavailableRanges.some((range) => overlaps([toWindow(range)], window))
}

/**
 * Fills every leg of every selected pairing.
 *
 * Two preferences decide who gets a seat. Somebody already on the same pairing wins,
 * so a roster keeps its crew together rather than reshuffling between its own legs.
 * After that the member who flew least recently wins, so a role is shared across the
 * run instead of one person absorbing every pairing.
 *
 * The function never throws and never reaches past the crew list: a role with nobody
 * available comes back empty, and it is `evaluateRules` that then reports the gap.
 */
export function autoAssign(pairings: readonly CommittedPairing[], crew: readonly CrewMember[]): LegAssignment[] {
  const queue = pairings
    .flatMap((pairing) => pairing.legs.map((leg) => ({ pairingId: pairing.id, leg })))
    .sort((a, b) => a.leg.departureAt.localeCompare(b.leg.departureAt))

  const assignments: LegAssignment[] = []
  const busy = new Map<string, Window[]>()
  const lastDutyEnd = new Map<string, number>()

  for (const { pairingId, leg } of queue) {
    const window = dutyWindow(leg)
    const onPairing = new Set(assignments.filter((a) => a.pairingId === pairingId).flatMap((a) => assignedCrew(a).map((m) => m.id)))

    /** Already on this pairing first, then whoever has been off duty the longest. */
    const ordered = (candidates: CrewMember[]) =>
      [...candidates].sort(
        (a, b) =>
          Number(onPairing.has(b.id)) - Number(onPairing.has(a.id)) ||
          (lastDutyEnd.get(a.id) ?? Number.NEGATIVE_INFINITY) - (lastDutyEnd.get(b.id) ?? Number.NEGATIVE_INFINITY),
      )

    const freeByRole = (role: CrewMember['role']) => ordered(crew.filter((m) => m.role === role && isAvailable(m, busy, window)))

    const assignment: LegAssignment = {
      pairingId,
      leg,
      captain: freeByRole('captain')[0] ?? null,
      firstOfficer: freeByRole('first_officer')[0] ?? null,
      cabinCrew: freeByRole('cabin').slice(0, CABIN_CREW_PER_LEG),
      localCrew: ordered(
        crew.filter((m) => m.role === 'local' && speaksDestination(m, leg.destination) && isAvailable(m, busy, window)),
      ).slice(0, 1),
      police: isInternational(leg) ? freeByRole('police').slice(0, POLICE_PER_INTERNATIONAL_LEG) : [],
    }

    for (const member of assignedCrew(assignment)) {
      busy.set(member.id, [...(busy.get(member.id) ?? []), window])
      lastDutyEnd.set(member.id, window.end)
    }
    assignments.push(assignment)
  }

  return assignments
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

interface Duty {
  leg: CommittedLeg
  reportAt: number
  arrivalAt: number
  departureAt: number
}

/**
 * Roles the duty rules do not apply to.
 *
 * A police escort is booked with the station per flight rather than rostered as duty:
 * the officer is released when the aircraft lands, and who covers the next sector is
 * the station's booking, not this roster's. Rule 5 still counts police, because that
 * rule is about how many officers are on the aircraft rather than how long they have
 * been on it.
 */
const DUTY_RULE_EXEMPT: readonly CrewRole[] = ['police']

function dutiesByMember(assignments: readonly LegAssignment[]): { member: CrewMember; duties: Duty[]; chains: Duty[][] }[] {
  const byMember = new Map<string, { member: CrewMember; duties: Duty[] }>()
  for (const assignment of assignments) {
    const window = dutyWindow(assignment.leg)
    for (const member of assignedCrew(assignment)) {
      if (DUTY_RULE_EXEMPT.includes(member.role)) continue
      const entry = byMember.get(member.id) ?? { member, duties: [] }
      entry.duties.push({
        leg: assignment.leg,
        reportAt: window.start,
        arrivalAt: window.end,
        departureAt: new Date(assignment.leg.departureAt).getTime(),
      })
      byMember.set(member.id, entry)
    }
  }
  return [...byMember.values()].map((entry) => ({ ...entry, chains: groupDuties(entry.duties) }))
}

/**
 * Chains a member's legs into duties.
 *
 * A duty is not a leg. Someone who flies out and straight back is on duty the whole
 * time and rests nothing in between, so measuring rest across the two would report a
 * break on every sector. A leg only continues the duty when it departs from the
 * airport the previous one landed at and the chain still fits inside a duty day; a leg
 * that would push the chain past the limit opens a new duty even when the aircraft
 * carries straight on, because that is where the crew is released.
 */
function groupDuties(duties: readonly Duty[]): Duty[][] {
  const ordered = [...duties].sort((a, b) => a.departureAt - b.departureAt)
  const maxDutyMs = RULE_LIMITS.maxDutyHoursPerDutyDay * 60 * 60_000
  const chains: Duty[][] = []
  for (const duty of ordered) {
    const current = chains.at(-1)
    const previous = current?.at(-1)
    const first = current?.at(0)
    const continues =
      previous !== undefined &&
      first !== undefined &&
      previous.leg.destination === duty.leg.origin &&
      duty.arrivalAt - first.reportAt <= maxDutyMs
    if (current && continues) current.push(duty)
    else chains.push([duty])
  }
  return chains
}

function hours(minutes: number): string {
  return `${Math.round(minutes / 60)} h`
}

/**
 * Rest is measured from the previous duty's landing to the next duty's report time.
 * The break is attached to the leg that has to change, not to the one before it:
 * swapping crew on the following leg is what resolves it.
 */
function restBreaks(assignments: readonly LegAssignment[]): RuleBreak[] {
  const breaks: RuleBreak[] = []
  for (const { member, chains } of dutiesByMember(assignments)) {
    for (let index = 1; index < chains.length; index += 1) {
      const previous = chains[index - 1].at(-1)
      const next = chains[index].at(0)
      if (!previous || !next) continue
      const rested = (next.reportAt - previous.arrivalAt) / 60_000
      if (rested >= RULE_LIMITS.minRestHours * 60) continue
      breaks.push({
        id: `REST_SHORT-${member.id}-${next.leg.flightId}`,
        code: 'REST_SHORT',
        severity: 'law',
        title: 'Minimum rest · law rule',
        detail:
          `${member.name} lands ${previous.leg.flightNumber} at ${formatTime(previous.leg.arrivalAt)} and reports for ` +
          `${next.leg.flightNumber} at ${formatTime(reportTime(next.leg))}: ${hours(rested)} rest, needs ${RULE_LIMITS.minRestHours} h.`,
        legIds: [next.leg.flightId],
      })
    }
  }
  return breaks
}

function policeBreaks(assignments: readonly LegAssignment[]): RuleBreak[] {
  return assignments
    .filter((assignment) => isInternational(assignment.leg) && assignment.police.length < POLICE_PER_INTERNATIONAL_LEG)
    .map((assignment) => ({
      id: `POLICE_MIN-${assignment.leg.flightId}`,
      code: 'POLICE_MIN' as const,
      severity: 'company' as const,
      title: 'Police minimum',
      detail:
        `${assignment.leg.flightNumber} ${formatRoute([assignment.leg.origin, assignment.leg.destination])} has ` +
        `${assignment.police.length} of ${POLICE_PER_INTERNATIONAL_LEG} police ` +
        `(international flights need ${POLICE_PER_INTERNATIONAL_LEG}).`,
      legIds: [assignment.leg.flightId],
    }))
}

function localCrewBreaks(assignments: readonly LegAssignment[]): RuleBreak[] {
  return assignments
    .filter((assignment) => assignment.localCrew.length === 0)
    .map((assignment) => {
      const language = DESTINATION_LANGUAGES[assignment.leg.destination]
      return {
        id: `NO_LOCAL_CREW-${assignment.leg.flightId}`,
        code: 'NO_LOCAL_CREW' as const,
        severity: 'company' as const,
        title: 'Local crew',
        detail:
          `${assignment.leg.flightNumber} to ${AIRPORT_CITIES[assignment.leg.destination] ?? assignment.leg.destination} ` +
          `has no crew who speak ${language?.label ?? 'the destination language'}.`,
        legIds: [assignment.leg.flightId],
      }
    })
}

function doubleBookingBreaks(assignments: readonly LegAssignment[]): RuleBreak[] {
  const breaks: RuleBreak[] = []
  for (const { member, duties } of dutiesByMember(assignments)) {
    const ordered = [...duties].sort((a, b) => a.departureAt - b.departureAt)
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]
      const next = ordered[index]
      if (minutesBetween(previous.leg.arrivalAt, next.leg.departureAt) >= 0) continue
      breaks.push({
        id: `DOUBLE_BOOKED-${next.leg.flightId}`,
        code: 'DOUBLE_BOOKED',
        severity: 'law',
        title: 'Overlapping flights · law rule',
        detail: `${member.name} is on ${previous.leg.flightNumber} and ${next.leg.flightNumber} at the same time.`,
        legIds: [previous.leg.flightId, next.leg.flightId],
      })
    }
  }
  return breaks
}

function dutyLengthBreaks(assignments: readonly LegAssignment[]): RuleBreak[] {
  const breaks: RuleBreak[] = []
  for (const { member, chains } of dutiesByMember(assignments)) {
    for (const chain of chains) {
      const first = chain[0]
      if (chain.length > RULE_LIMITS.maxFlightsPerDutyDay) {
        breaks.push({
          id: `DUTY_FLIGHTS-${member.id}-${first.leg.flightId}`,
          code: 'DUTY_FLIGHTS',
          severity: 'law',
          title: 'Flights per duty · law rule',
          detail:
            `${member.name} has ${chain.length} flights in one duty on ${formatDay(first.leg.departureAt)}, ` +
            `over the ${RULE_LIMITS.maxFlightsPerDutyDay} allowed.`,
          legIds: chain.map((duty) => duty.leg.flightId),
        })
      }
      const flown = chain.reduce((total, duty) => total + minutesBetween(duty.leg.departureAt, duty.leg.arrivalAt), 0)
      if (flown > RULE_LIMITS.maxDutyHoursPerDutyDay * 60) {
        breaks.push({
          id: `DUTY_HOURS-${member.id}-${first.leg.flightId}`,
          code: 'DUTY_HOURS',
          severity: 'law',
          title: 'Duty length · law rule',
          detail:
            `${member.name} flies ${hours(flown)} on ${formatDay(first.leg.departureAt)}, ` +
            `over the ${RULE_LIMITS.maxDutyHoursPerDutyDay} h allowed.`,
          legIds: chain.map((duty) => duty.leg.flightId),
        })
      }
    }
  }
  return breaks
}

function flightHourBreaks(assignments: readonly LegAssignment[]): RuleBreak[] {
  const breaks: RuleBreak[] = []
  for (const { member, duties } of dutiesByMember(assignments)) {
    const flown = duties.reduce((total, duty) => total + minutesBetween(duty.leg.departureAt, duty.leg.arrivalAt), 0)
    if (flown <= RULE_LIMITS.maxFlightHoursPerWindow * 60) continue
    breaks.push({
      id: `FLIGHT_HOURS_28D-${member.id}`,
      code: 'FLIGHT_HOURS_28D',
      severity: 'law',
      title: 'Flight hours · law rule',
      detail:
        `${member.name} flies ${hours(flown)} across the ${RULE_LIMITS.flightHourWindowDays}-day window, ` +
        `over the ${RULE_LIMITS.maxFlightHoursPerWindow} h allowed.`,
      legIds: duties.map((duty) => duty.leg.flightId),
    })
  }
  return breaks
}

/**
 * Every break in the run.
 *
 * The order is deliberate and matches the order the brief lists them in: the rest
 * break a supervisor has to resolve first, then the two company-rule shortages, then
 * the law checks that auto-assign is designed to prevent.
 */
export function evaluateRules(assignments: readonly LegAssignment[]): RuleBreak[] {
  return [
    ...restBreaks(assignments),
    ...policeBreaks(assignments),
    ...localCrewBreaks(assignments),
    ...doubleBookingBreaks(assignments),
    ...dutyLengthBreaks(assignments),
    ...flightHourBreaks(assignments),
  ]
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

/** Breaks grouped by the leg they belong to, for tinting rows and listing badges. */
export function breaksByLeg(assignments: readonly LegAssignment[], breaks: readonly RuleBreak[]): Map<string, RuleBreak[]> {
  const grouped = new Map<string, RuleBreak[]>()
  for (const assignment of assignments) grouped.set(assignment.leg.flightId, [])
  for (const ruleBreak of breaks) {
    for (const legId of ruleBreak.legIds) {
      grouped.set(legId, [...(grouped.get(legId) ?? []), ruleBreak])
    }
  }
  return grouped
}

/**
 * A leg counts as fully crewed when every role ended up with at least one person.
 * That is deliberately weaker than "has no breaks": a leg short one of two police is
 * still crewed, it is just breaking a rule, and the two numbers are reported
 * separately so neither is read as the other.
 */
export function summarise(assignments: readonly LegAssignment[], breaks: readonly RuleBreak[]): AssignmentSummary {
  const brokenLegs = new Set(breaks.flatMap((ruleBreak) => ruleBreak.legIds))
  const fullyCrewed = assignments.filter(
    (assignment) =>
      assignment.captain !== null &&
      assignment.firstOfficer !== null &&
      assignment.cabinCrew.length > 0 &&
      assignment.localCrew.length > 0 &&
      (!isInternational(assignment.leg) || assignment.police.length > 0),
  )
  return {
    totalLegs: assignments.length,
    fullyCrewedLegs: fullyCrewed.length,
    brokenLegs: brokenLegs.size,
    breakCount: breaks.length,
  }
}
