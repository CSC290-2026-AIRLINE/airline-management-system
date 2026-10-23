/**
 * Every sentence the fix workspace prints, written in one place.
 *
 * The list on the left, the panel on the right, the green banner after a fix and the
 * closed table all describe the same open item. If each of them built its own wording
 * they would drift, and the mockups are explicit that they agree — the same break is
 * quoted three times per view. So the numbers are recomputed here rather than parsed
 * out of `RuleBreak.detail`, which is written for a different audience.
 */
import { ROSTER_TIME_ZONE, formatTime } from '../../build-pairings/types/format'
import { RULE_LIMITS, reportTime } from '../../assign-crew/types/crew-engine'
import { AIRPORT_CITIES, DESTINATION_LANGUAGES, POLICE_PER_INTERNATIONAL_LEG } from '../../assign-crew/types/mock-data'
import { replacementCandidates, seatTargetFor, type PoolMember } from './replacement-pool'
import type { CrewRole, FixBreak, LegAssignment, ReplacementSet, RuleBreak, SickCall } from './types'

/**
 * The six rules as the strip prints them.
 *
 * The numbers are the rule numbers used everywhere else in the feature; the labels are
 * shortened from `ROSTER_RULES` because this strip has to fit on one line above the
 * workspace, and a supervisor reading it mid-fix needs the thresholds, not the prose.
 */
export const RULE_CHIPS: readonly { number: number; label: string }[] = [
  { number: 1, label: `Max ${RULE_LIMITS.maxFlightsPerDutyDay} flights or ${RULE_LIMITS.maxDutyHoursPerDutyDay} h per duty` },
  { number: 2, label: `Min ${RULE_LIMITS.minRestHours} h rest` },
  { number: 3, label: `Max ${RULE_LIMITS.maxFlightHoursPerWindow} h per ${RULE_LIMITS.flightHourWindowDays} days` },
  { number: 4, label: 'Local crew speaks the language' },
  { number: 5, label: `At least ${POLICE_PER_INTERNATIONAL_LEG} police` },
  { number: 6, label: 'No overlapping flights' },
]

/** `15 Sep` — the day without the weekday, which the table's flight cell prints. */
const dayMonthFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: ROSTER_TIME_ZONE })

export function dayMonth(instant: string): string {
  return dayMonthFormatter.format(new Date(instant))
}

/** `BKK → NRT`. The arrow the fix-publish mockups use, rather than Build pairings'. */
function route(leg: LegAssignment['leg']): string {
  return `${leg.origin} → ${leg.destination}`
}

function flightSpan(assignment: LegAssignment): string {
  return `${assignment.leg.flightNumber} · ${formatTime(assignment.leg.departureAt)}–${formatTime(assignment.leg.arrivalAt)}`
}

const ROLE_LABELS: Record<CrewRole, string> = {
  captain: 'Captain',
  first_officer: 'First officer',
  cabin: 'Cabin crew',
  local: 'Local crew',
  police: 'Police',
}

function roleLabel(role: CrewRole): string {
  return ROLE_LABELS[role]
}

/** Every crew member on a leg with the seat they occupy, for the sick-call picker. */
export function crewOn(assignment: LegAssignment): { member: NonNullable<LegAssignment['captain']>; role: CrewRole }[] {
  return [
    ...(assignment.captain ? [{ member: assignment.captain, role: 'captain' as const }] : []),
    ...(assignment.firstOfficer ? [{ member: assignment.firstOfficer, role: 'first_officer' as const }] : []),
    ...assignment.cabinCrew.map((member) => ({ member, role: 'cabin' as const })),
    ...assignment.localCrew.map((member) => ({ member, role: 'local' as const })),
    ...assignment.police.map((member) => ({ member, role: 'police' as const })),
  ]
}

function assignmentFor(assignments: readonly LegAssignment[], legId: string): LegAssignment | undefined {
  return assignments.find((assignment) => assignment.leg.flightId === legId)
}

/**
 * The plain-English name of a break, for places that show it beside the code rather
 * than in it — the override modal's summary card.
 */
const BREAK_NOUNS: Record<string, string> = {
  REST_SHORT: 'minimum rest not met',
  POLICE_MIN: 'police minimum not met',
  NO_LOCAL_CREW: 'destination language not spoken',
  NO_LEGAL_CREW: 'no legal crew available',
  SICK_CALL: 'crew removed from a live roster',
}

export function breakNoun(code: string): string {
  return BREAK_NOUNS[code] ?? 'rule break'
}

/**
 * How the item reads in the left list.
 *
 * Only the seat break is written differently — `Sick call · FD511` rather than a rule
 * code, because there is no rule that failed; there is a seat nobody is in.
 */
export function listLabel(item: FixBreak): string {
  return item.code === 'SICK_CALL' ? `Sick call · ${item.flightNumber}` : item.code
}

// ---------------------------------------------------------------------------
// Minimum rest
// ---------------------------------------------------------------------------

interface RestStory {
  member: NonNullable<LegAssignment['captain']>
  role: CrewRole
  previous: LegAssignment
  next: LegAssignment
  rested: number
}

/** A break with the two fields the caller fills in: its number and its candidates. */
export type DescribedBreak = Omit<FixBreak, 'position' | 'replacement'>

/**
 * Who is short of rest on a leg, and between which two duties.
 *
 * Returns every shortfall on the leg rather than the first, because the engine raises
 * one break per crew member and each of them names a different person. Recomputed from
 * the assignments rather than read out of the break, because the panel needs the two
 * timestamps separately: the break sentence reads them as one long clause, the facts
 * table prints them on separate rows.
 */
function restStories(assignments: readonly LegAssignment[], legId: string): RestStory[] {
  const target = assignmentFor(assignments, legId)
  if (!target) return []

  const stories: RestStory[] = []
  for (const { member, role } of crewOn(target)) {
    const duties = assignments
      .filter((assignment) => crewOn(assignment).some((seat) => seat.member.id === member.id))
      .sort((a, b) => a.leg.departureAt.localeCompare(b.leg.departureAt))
    for (let index = 1; index < duties.length; index += 1) {
      const previous = duties[index - 1]
      const next = duties[index]
      if (!previous || !next || next.leg.flightId !== legId) continue
      const rested = (new Date(reportTime(next.leg)).getTime() - new Date(previous.leg.arrivalAt).getTime()) / 60_000
      if (rested < RULE_LIMITS.minRestHours * 60) {
        stories.push({ member, role, previous, next, rested })
        break
      }
    }
  }
  return stories
}

function restFacts(story: RestStory, pairingId: string, delayed: boolean): DescribedBreak {
  const needed = RULE_LIMITS.minRestHours
  const rested = Math.round(story.rested / 60)
  const next = story.next.leg
  const explanation = delayed
    ? `After the delay ${story.member.name} reports for ${next.flightNumber} at ${formatTime(reportTime(next))}, giving ${rested} h rest. ` +
      `The minimum is still ${needed} h, so the break stays open. Law rules can't be overridden.`
    : `${story.member.name} lands ${story.previous.leg.flightNumber} at ${formatTime(story.previous.leg.arrivalAt)} on ${dayMonth(story.previous.leg.arrivalAt)} and reports for ` +
      `${next.flightNumber} at ${formatTime(reportTime(next))} on ${dayMonth(reportTime(next))}. That is ${rested} h rest; the minimum is ${needed} h. ` +
      `Law rules can't be overridden.`

  const requiredAction = `Replace the ${roleLabel(story.role).toLowerCase()} on ${pairingId}`

  return {
    id: `REST_SHORT-${story.member.id}-${next.flightId}`,
    code: 'REST_SHORT',
    title: 'REST_SHORT',
    severity: 'law',
    pairingId,
    legId: next.flightId,
    flightNumber: next.flightNumber,
    context: `${pairingId} · ${next.flightNumber} ${route(next)} · ${roleLabel(story.role)} ${story.member.name} · law rule`,
    explanation,
    requiredAction,
    shortDetail: `${story.member.name} has ${rested} h rest before ${next.flightNumber}${delayed ? ' (after delay)' : ''}`,
    seatRole: story.role,
    subjectId: story.member.id,
    facts: [
      { label: 'Person', value: `${story.member.name} · ${roleLabel(story.role)}` },
      {
        label: `Lands ${story.previous.leg.flightNumber} (${dayMonth(story.previous.leg.arrivalAt)})`,
        value: formatTime(story.previous.leg.arrivalAt),
      },
      {
        label: `Reports for ${next.flightNumber} (${dayMonth(next.departureAt)}${delayed ? ', delayed' : ''})`,
        value: formatTime(reportTime(next)),
      },
      { label: 'Rest between duties', value: `${rested} h · needs ${needed} h`, danger: true },
      { label: 'Required action', value: requiredAction, danger: true },
    ],
  }
}

// ---------------------------------------------------------------------------
// Police minimum
// ---------------------------------------------------------------------------

function policeFacts(assignment: LegAssignment): DescribedBreak {
  const leg = assignment.leg
  const names = assignment.police.map((member) => member.name).join(', ') || 'None'
  const assigned = assignment.police.length
  const required = POLICE_PER_INTERNATIONAL_LEG
  const missing = required - assigned
  const requiredAction = `Add ${missing} police officer${missing === 1 ? '' : 's'}`

  return {
    id: `POLICE_MIN-${leg.flightId}`,
    code: 'POLICE_MIN',
    title: 'POLICE_MIN',
    severity: 'company',
    pairingId: assignment.pairingId,
    legId: leg.flightId,
    flightNumber: leg.flightNumber,
    context: `${assignment.pairingId} · ${leg.flightNumber} ${route(leg)} · ${assigned} of ${required} police`,
    explanation: `${leg.flightNumber} is an international flight, so it needs ${required} police. Only ${names} is assigned.`,
    requiredAction,
    shortDetail: `${leg.flightNumber} to ${AIRPORT_CITIES[leg.destination] ?? leg.destination} has ${assigned} of ${required} police`,
    seatRole: 'police',
    facts: [
      { label: 'Police', value: `${assigned} of ${required} · ${names}`, danger: true },
      { label: 'Flight', value: flightSpan(assignment) },
      { label: 'Pairing', value: assignment.pairingId },
      { label: 'Status', value: 'POLICE_MIN' },
      { label: 'Required action', value: requiredAction, danger: true },
    ],
  }
}

// ---------------------------------------------------------------------------
// Local crew
// ---------------------------------------------------------------------------

function localCrewFacts(assignment: LegAssignment): DescribedBreak {
  const leg = assignment.leg
  const language = DESTINATION_LANGUAGES[leg.destination]
  const city = AIRPORT_CITIES[leg.destination] ?? leg.destination
  const code = language?.code.toUpperCase() ?? '—'
  const requiredAction = `Swap in 1 ${language?.label ?? 'local'} speaker`

  return {
    id: `NO_LOCAL_CREW-${leg.flightId}`,
    code: 'NO_LOCAL_CREW',
    title: 'NO_LOCAL_CREW',
    severity: 'company',
    pairingId: assignment.pairingId,
    legId: leg.flightId,
    flightNumber: leg.flightNumber,
    context: `${assignment.pairingId} · ${leg.flightNumber} ${route(leg)} · no ${language?.label ?? 'local'} speaker`,
    explanation:
      `${leg.flightNumber} lands in ${city}, so at least 1 crew member must speak ` +
      `${language?.label ?? 'the destination language'}. No one assigned does.`,
    requiredAction,
    shortDetail: `${leg.flightNumber} to ${city} has no ${code} local crew`,
    seatRole: 'local',
    facts: [
      { label: 'Local crew', value: assignment.localCrew.map((member) => member.name).join(', ') || 'None', danger: true },
      { label: 'Flight', value: flightSpan(assignment) },
      { label: 'Pairing', value: assignment.pairingId },
      { label: 'Status', value: 'NO_LOCAL_CREW' },
      { label: 'Required action', value: requiredAction, danger: true },
    ],
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface DescribeOptions {
  /** True when Feature 2 has moved this leg, which changes the rest arithmetic. */
  delayed?: boolean
  /** Every crew member who could be swapped in, run crew and pool together. */
  pool: readonly PoolMember[]
  /** Crew who cannot be offered the seat even where the rules would allow it. */
  blockedIds?: readonly string[]
}

/**
 * Turns one engine break into everything the workspace needs to show and fix it.
 *
 * Returns `null` for a code this page cannot act on. That is deliberate rather than
 * defensive: if step 2 ever grows a rule that has no seat behind it, the break still
 * has to be visible in the list, it just cannot be fixed from here.
 */
export function describeBreak(
  ruleBreak: RuleBreak,
  assignments: readonly LegAssignment[],
  options: DescribeOptions,
): DescribedBreak | null {
  const legId = ruleBreak.legIds[0]
  if (!legId) return null
  const assignment = assignmentFor(assignments, legId)
  if (!assignment) return null

  switch (ruleBreak.code) {
    case 'REST_SHORT': {
      // The engine raises one break per person, so the break has to pick its own
      // subject out of the leg's shortfalls. Matching on the id rather than taking the
      // first would otherwise label every rest break on a leg with whoever happens to
      // be crewed first, which is usually the captain.
      const stories = restStories(assignments, legId)
      const story = stories.find((candidate) => ruleBreak.id.includes(candidate.member.id)) ?? stories[0]
      if (!story) return null
      return restFacts(story, assignment.pairingId, options.delayed === true)
    }
    case 'POLICE_MIN':
      return policeFacts(assignment)
    case 'NO_LOCAL_CREW':
      return localCrewFacts(assignment)
    default:
      return null
  }
}

/**
 * An open seat left by a sick call on a live roster.
 *
 * `evaluateRules` cannot produce this one: it checks a roster, and it does not know a
 * roster was supposed to have somebody in that seat. Whether the seat can be refilled
 * is a question the candidate rules do answer, so the removed crew member comes from
 * here and the replacement set comes from `replacement-pool`.
 *
 * `assignments` is the whole run rather than just this leg, because rest and flight
 * hours are both measured across everything the candidate already flies — a captain
 * crewing the Seoul sector is not free for the Tokyo one even though the two legs are
 * a day apart.
 */
export function describeSickCall(sickCall: SickCall, assignments: readonly LegAssignment[], options: DescribeOptions): FixBreak | null {
  const assignment = assignmentFor(assignments, sickCall.legId)
  if (!assignment) return null
  const leg = assignment.leg
  const target = seatTargetFor('SICK_CALL', leg, sickCall.role)
  const replacement = target
    ? replacementCandidates(target, leg, assignments, options.pool, [...(options.blockedIds ?? []), sickCall.memberId])
    : undefined
  const uncovered = replacement !== undefined && replacement.allowedCount === 0
  const requiredAction = uncovered ? 'No legal captain · leg uncovered' : `Add 1 ${roleLabel(sickCall.role).toLowerCase()}`

  return {
    id: sickCall.id,
    code: 'SICK_CALL',
    title: 'SICK CALL',
    // A seat with nobody in it is law, not a company matter to write around.
    severity: 'law',
    position: 0,
    pairingId: assignment.pairingId,
    legId: leg.flightId,
    flightNumber: leg.flightNumber,
    context: `${assignment.pairingId} · ${leg.flightNumber} ${route(leg)} · ${dayMonth(leg.departureAt)} · ${roleLabel(sickCall.role).toLowerCase()} seat empty`,
    explanation: uncovered
      ? `NO_LEGAL_CREW · ${sickCall.removed.name} was removed from ${leg.flightNumber} (${sickCall.removed.reason.toLowerCase()}) and no ` +
        `${roleLabel(sickCall.role).toLowerCase()} passes every rule. The leg stays uncovered and shows on Coverage; Flight Scheduling ` +
        `(Feature 2) is told it isn't fully crewed.`
      : `${sickCall.removed.name} was removed from ${leg.flightNumber} (reason: ${sickCall.removed.reason.toLowerCase()}). The roster is ` +
        `already published, so the fix is re-checked and re-sent to the crew affected.`,
    requiredAction,
    shortDetail: `${roleLabel(sickCall.role)} seat empty after ${sickCall.removed.name}'s ${sickCall.removed.reason.toLowerCase()}`,
    seatRole: sickCall.role,
    removed: sickCall.removed,
    facts: [
      { label: 'Removed', value: `${sickCall.removed.name} · ${roleLabel(sickCall.removed.role)}` },
      { label: 'Reason', value: sickCall.removed.reason },
      { label: 'Flight', value: flightSpan(assignment) },
      { label: 'Pairing', value: assignment.pairingId },
      { label: 'Required action', value: requiredAction, danger: true },
    ],
    replacement,
  }
}

/** `P-102 (FD511 → FD512)` — the whole pairing, in the order it is flown. */
function pairingLabel(assignment: LegAssignment, assignments: readonly LegAssignment[]): string {
  const legs = assignments
    .filter((candidate) => candidate.pairingId === assignment.pairingId)
    .sort((a, b) => a.leg.departureAt.localeCompare(b.leg.departureAt))
    .map((candidate) => candidate.leg.flightNumber)
  return `${assignment.pairingId} (${legs.join(' → ')})`
}

/** Builds the candidate set for a rule break. Returns the break with it attached. */
export function withReplacement(
  described: DescribedBreak,
  assignment: LegAssignment,
  assignments: readonly LegAssignment[],
  options: DescribeOptions,
): FixBreak {
  const target = seatTargetFor(described.code, assignment.leg, described.seatRole)
  if (!target) return { ...described, position: 0 }

  const set: ReplacementSet = replacementCandidates(target, assignment.leg, assignments, options.pool, options.blockedIds)
  const labelled =
    target.availability === 'ofTotal' ? { ...set, availableLabel: `${set.allowedCount} of ${set.candidates.length} can take it` } : set

  // A rest break is closed by moving somebody across the *pairing*, not just the leg the
  // break names — the short rest is measured between the two. So the instruction has to
  // name both legs, or the operator swaps one seat and the break comes straight back.
  const replacement =
    described.code === 'REST_SHORT'
      ? { ...labelled, instruction: `Swap the pairing, ${pairingLabel(assignment, assignments)}. Match the seat, rest and duty limits.` }
      : labelled

  return { ...described, position: 0, replacement }
}
