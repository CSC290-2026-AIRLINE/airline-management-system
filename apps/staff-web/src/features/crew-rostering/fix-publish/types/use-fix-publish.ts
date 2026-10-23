/**
 * All fix-publish state in one place.
 *
 * The rule the whole page turns on: there is no separate "fixed roster" sitting next
 * to the assigned one. Every edit rewrites `assignments` and the break list is
 * re-derived from it by step 2's `evaluateRules`, which is what the strip across the
 * page promises — *every fix is re-checked against* all six rules. A swap that opens a
 * new break therefore appears in the list immediately rather than at publish time.
 *
 * What is stored rather than derived is the history: which items were closed and how,
 * what has been published, and the crew members who have come off a live roster. A
 * closed item is snapshotted whole, because the engine stops emitting it the moment
 * the rule stops failing and the closed table still has to name the flight.
 */
import { useCallback, useMemo, useState } from 'react'
import { formatDateRange, formatFullDay, formatTime, localDateKey } from '../../build-pairings/types/format'
import { MOCK_ROSTER_RUN } from '../../build-pairings/types/mock-data'
import { autoAssign, evaluateRules } from '../../assign-crew/types/crew-engine'
import {
  CABIN_CREW_PER_LEG,
  DESTINATION_LANGUAGES,
  MOCK_COMMITTED_PAIRINGS,
  MOCK_CREW,
  POLICE_PER_INTERNATIONAL_LEG,
} from '../../assign-crew/types/mock-data'
import { crewOn, describeBreak, describeSickCall, withReplacement } from './break-descriptions'
import { REPLACEMENT_POOL, type PoolMember } from './replacement-pool'
import type { CrewMember, CrewRole, FixBreak, LegAssignment, PageBanner, PublishCheck, Resolution, RosterStatus, SickCall } from './types'

/** How far Feature 2 pushes a delayed leg. Enough to turn a legal rest into a break. */
export const DEMO_DELAY_MINUTES = 120

/**
 * Everyone who could be offered a seat: the pool plus the run's own crew.
 *
 * The run's crew is included because a name can come off one leg and go straight back
 * on another. It is appended rather than merged into `REPLACEMENT_POOL` so that
 * widening the offer list cannot change what step 2 auto-assigns — the two lists have
 * different jobs, and only one of them feeds the engine.
 */
export const CANDIDATE_POOL: readonly PoolMember[] = [
  ...REPLACEMENT_POOL,
  ...MOCK_CREW.map((member) => ({
    ...member,
    baselineHours: 0,
    previousDutyEnd: '2026-09-14T00:00:00.000Z' as PoolMember['previousDutyEnd'],
    busyFlightIds: [],
  })),
]

const SEAT_LABEL: Record<CrewRole, string> = {
  captain: 'Captain',
  first_officer: 'First officer',
  cabin: 'Cabin crew',
  local: 'Local crew',
  police: 'Police',
}

/** The green line in the left list: `P. Thongdee now captains P-102`. */
const CREWED_VERB: Record<CrewRole, string> = {
  captain: 'now captains',
  first_officer: 'now flies as first officer',
  cabin: 'now works cabin crew',
  local: 'now works local crew',
  police: 'now works police',
}

/** The two-word verb in the closed table: `captain swapped`, `police added`. */
const CLOSED_VERB: Record<CrewRole, string> = {
  captain: 'captain swapped',
  first_officer: 'first officer swapped',
  cabin: 'cabin crew added',
  local: 'local crew added',
  police: 'police added',
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function seatsIn(assignment: LegAssignment, role: CrewRole): (CrewMember | null)[] {
  switch (role) {
    case 'captain':
      return [assignment.captain]
    case 'first_officer':
      return [assignment.firstOfficer]
    case 'cabin':
      return [...assignment.cabinCrew, ...Array.from({ length: CABIN_CREW_PER_LEG - assignment.cabinCrew.length }, () => null)]
    case 'local':
      return [...assignment.localCrew, ...Array.from({ length: 1 - assignment.localCrew.length }, () => null)]
    case 'police':
      return [...assignment.police, ...Array.from({ length: POLICE_PER_INTERNATIONAL_LEG - assignment.police.length }, () => null)]
  }
}

/**
 * Writes one seat.
 *
 * Multi-seat roles fill the first free seat rather than appending, so the cabin and
 * police lists keep the order the roster prints them in and a second officer does not
 * displace the first.
 *
 * `replaceId` names the person coming off. It matters when two crew on one leg are
 * both short of rest: without it the swap would replace the first seat both times and
 * the second officer would still be on the leg with the break unchanged. A break
 * always knows who it is about, so the seat it names is the seat that moves.
 */
function withSeat(assignment: LegAssignment, role: CrewRole, member: CrewMember, replaceId?: string): LegAssignment {
  switch (role) {
    case 'captain':
      return { ...assignment, captain: member }
    case 'first_officer':
      return { ...assignment, firstOfficer: member }
    case 'local':
      return { ...assignment, localCrew: [member] }
    case 'cabin':
      return { ...assignment, cabinCrew: writeSeat(seatsIn(assignment, 'cabin'), member, replaceId) }
    case 'police':
      return { ...assignment, police: writeSeat(seatsIn(assignment, 'police'), member, replaceId) }
  }
}

function writeSeat(seats: (CrewMember | null)[], member: CrewMember, replaceId?: string): CrewMember[] {
  const named = replaceId ? seats.findIndex((seat) => seat?.id === replaceId) : -1
  const free = seats.findIndex((seat) => seat === null)
  const at = named !== -1 ? named : free
  const next = [...seats]
  next[at === -1 ? 0 : at] = member
  return next.filter((seat): seat is CrewMember => seat !== null)
}

/** Takes one person off one leg without touching the rest of the pairing. */
function withoutSeat(assignment: LegAssignment, role: CrewRole, memberId: string): LegAssignment {
  switch (role) {
    case 'captain':
      return assignment.captain?.id === memberId ? { ...assignment, captain: null } : assignment
    case 'first_officer':
      return assignment.firstOfficer?.id === memberId ? { ...assignment, firstOfficer: null } : assignment
    case 'local':
      return { ...assignment, localCrew: assignment.localCrew.filter((member) => member.id !== memberId) }
    case 'cabin':
      return { ...assignment, cabinCrew: assignment.cabinCrew.filter((member) => member.id !== memberId) }
    case 'police':
      return { ...assignment, police: assignment.police.filter((member) => member.id !== memberId) }
  }
}

export interface FixPublishState {
  assignments: LegAssignment[]
  /** Every open and closed item, in the order the left list numbers them. */
  breaks: FixBreak[]
  openBreaks: FixBreak[]
  selectedBreak: FixBreak | null
  selectBreak: (id: string) => void
  status: RosterStatus
  /** `Draft` or `Published` — the label on the run badge. */
  rosterStatusLabel: string
  /** `Open breaks`, `Sick call` or `Uncovered leg`; null when there is nothing open. */
  heading: string | null
  /** How many items the run has ever had, so the progress bar has a fixed length. */
  totalItems: number
  /** The green sentence describing the fix that was just applied, shown in the panel. */
  fixNotice: string | null
  /** The full-width strip above the workspace. */
  banner: PageBanner | null
  /** The delay Feature 2 pushed onto a leg, in minutes. 0 when nothing has moved. */
  delayMinutes: number
  /** The leg Feature 2 moved, so the button can name it. */
  delayedLegId: string | null
  delayFlight: (legId: string) => void
  canPublish: boolean
  publishChecks: PublishCheck[]
  publish: () => void
  swapIn: (breakId: string, candidateId: string) => void
  overrideBreak: (breakId: string, reason: string) => void
  /** True once every seat a sick call left open has been refilled. */
  isUpdated: boolean
  sickCalls: SickCall[]
  raiseSickCall: (legId: string, memberId: string, reason: string) => void
  coverSeat: (callId: string, candidateId: string) => void
  /** The roster row the published table needs for one leg. */
  rosterFor: (legId: string) => LegAssignment | undefined
  /** Legs that are still missing their required seats. */
  uncoveredLegIds: readonly string[]
}

export function useFixPublish(): FixPublishState {
  const [assignments, setAssignments] = useState<LegAssignment[]>(() => autoAssign(MOCK_COMMITTED_PAIRINGS, MOCK_CREW))
  const [closed, setClosed] = useState<FixBreak[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<RosterStatus>('draft')
  const [sickCalls, setSickCalls] = useState<SickCall[]>([])
  const [delayed, setDelayed] = useState<{ legId: string; minutes: number } | null>(null)
  const [fixNotice, setFixNotice] = useState<string | null>(null)
  const [updateNote, setUpdateNote] = useState<string | null>(null)

  // An item keeps the number it was first given, so closing one does not relabel the
  // ones underneath it. `totalItems` reads this map's size for the progress bar.
  const [numbering, setNumbering] = useState<ReadonlyMap<string, number>>(() => new Map())

  /**
   * The open list, rebuilt from the roster on every edit, with each item's number.
   *
   * Two sources: the rule breaks the engine raises, and the seats a sick call on a
   * live roster left empty. Engine order is kept rather than sorted by time, because
   * that is the order the rules are numbered in and an operator reads the list
   * against the rule strip above it.
   *
   * An item that has never been numbered takes the next free number, and the map is
   * written back by the effect below rather than during render — mutating a ref here
   * would mean the numbers depended on how many times the page had rendered rather
   * than on which items exist.
   */
  const numbered = useMemo(() => {
    const described: FixBreak[] = []
    for (const ruleBreak of evaluateRules(assignments)) {
      const body = describeBreak(ruleBreak, assignments, { pool: CANDIDATE_POOL })
      if (!body) continue
      const assignment = assignments.find((item) => item.leg.flightId === body.legId)
      if (!assignment) continue
      described.push(withReplacement(body, assignment, assignments, { pool: CANDIDATE_POOL, delayed: delayed?.legId === body.legId }))
    }

    for (const call of sickCalls) {
      if (call.replacementId) continue
      const seat = describeSickCall(call, assignments, { pool: CANDIDATE_POOL })
      if (seat) described.push(seat)
    }

    const known = new Map(numbering)
    for (const item of described) {
      if (!known.has(item.id)) known.set(item.id, known.size + 1)
    }

    return {
      items: described.map((item) => ({ ...item, position: known.get(item.id) ?? 1 })).sort((a, b) => a.position - b.position),
      known,
    }
  }, [assignments, sickCalls, delayed, numbering])

  // Written back during render rather than in an effect: this is React's "adjust state
  // when something changes" case, and an effect would cascade an extra render for the
  // same result. React re-runs this component immediately without committing the frame
  // that noticed the new item, so the list never renders a half-numbered row.
  if (numbering.size !== numbered.known.size) setNumbering(numbered.known)

  const openBreaks = numbered.items

  // Closed items keep their number so the left list does not renumber everything
  // below them the moment one is closed. An item the engine is still raising drops
  // its old resolution, because a fix that did not hold is not a resolution.
  const breaks = useMemo(() => {
    const open = new Set(openBreaks.map((item) => item.id))
    return [...openBreaks, ...closed.filter((item) => !open.has(item.id))].sort((a, b) => a.position - b.position)
  }, [openBreaks, closed])

  const selectedBreak = breaks.find((item) => item.id === selectedId) ?? openBreaks[0] ?? null
  const canPublish = openBreaks.length === 0 && status === 'draft'

  const publishChecks = useMemo(() => checksFor(assignments, breaks, status, sickCalls), [assignments, breaks, status, sickCalls])

  const uncoveredLegIds = useMemo(
    () => openBreaks.filter((item) => item.code === 'SICK_CALL' && item.replacement?.allowedCount === 0).map((item) => item.legId),
    [openBreaks],
  )

  const closeBreak = useCallback((target: FixBreak, resolution: Resolution) => {
    setClosed((current) => [...current.filter((item) => item.id !== target.id), { ...target, resolution, replacement: undefined }])
    setFixNotice(resolution.banner)
    setSelectedId(null)
  }, [])

  /**
   * The swap.
   *
   * `REST_SHORT` is the one rule where filling the seat is not enough: the person short
   * of rest has to come off the pairing, or the new captain inherits the same chain. So
   * a rest fix rewrites every leg of the pairing and the rest touch the one leg.
   */
  const swapIn = useCallback(
    (breakId: string, candidateId: string) => {
      const target = breaks.find((item) => item.id === breakId)
      const candidate = CANDIDATE_POOL.find((member) => member.id === candidateId)
      if (!target || !candidate) return
      const role = target.seatRole

      const affected =
        target.code === 'REST_SHORT'
          ? assignments.filter((assignment) => assignment.pairingId === target.pairingId)
          : assignments.filter((assignment) => assignment.leg.flightId === target.legId)
      const first = affected[0]
      const outgoing = target.subjectId && first ? (seatsIn(first, role).find((seat) => seat?.id === target.subjectId) ?? null) : null

      setAssignments((current) =>
        current.map((assignment) =>
          affected.some((leg) => leg.leg.flightId === assignment.leg.flightId)
            ? withSeat(assignment, role, candidate, target.subjectId)
            : assignment,
        ),
      )

      closeBreak(target, resolutionFor(target, candidate, outgoing, first?.leg.destination ?? ''))
    },
    [assignments, breaks, closeBreak],
  )

  /**
   * A company-rule break closed in writing instead of by swapping somebody in.
   *
   * The rule keeps failing afterwards, so the item stays in the list with its
   * resolution attached rather than being dropped — otherwise "0 open" would be a lie
   * about what the engine says. The override is the one resolution that needs a
   * reason, which is why `Resolution` will not let it exist without one.
   */
  const overrideBreak = useCallback(
    (breakId: string, reason: string) => {
      const target = breaks.find((item) => item.id === breakId)
      if (!target) return
      closeBreak(target, {
        kind: 'overridden',
        summary: `Reason: ${lowerFirst(reason)}`,
        short: 'reason logged',
        reason,
        banner: `${target.code} overridden · "${reason}${reason.endsWith('.') ? '' : '.'}" Saved to the audit log (Feature 15).`,
      })
    },
    [breaks, closeBreak],
  )

  const publish = useCallback(() => setStatus('published'), [])

  /** Taking somebody off a live roster leaves a seat the operator has to fill. */
  const raiseSickCall = useCallback(
    (legId: string, memberId: string, reason: string) => {
      const assignment = assignments.find((item) => item.leg.flightId === legId)
      const seat = assignment ? crewOn(assignment).find((item) => item.member.id === memberId) : undefined
      if (!assignment || !seat) return

      setAssignments((current) => current.map((item) => (item.leg.flightId === legId ? withoutSeat(item, seat.role, memberId) : item)))
      setSickCalls((current) => [
        ...current,
        {
          id: `SICK-${legId}-${memberId}`,
          legId,
          memberId,
          role: seat.role,
          removed: { name: seat.member.name, role: seat.role, reason },
        },
      ])
      setSelectedId(`SICK-${legId}-${memberId}`)
      setFixNotice(null)
    },
    [assignments],
  )

  /** The replacement goes on, the seat closes, and the crew are re-notified. */
  const coverSeat = useCallback(
    (callId: string, candidateId: string) => {
      const call = sickCalls.find((item) => item.id === callId)
      const candidate = CANDIDATE_POOL.find((member) => member.id === candidateId)
      const assignment = call ? assignments.find((item) => item.leg.flightId === call.legId) : undefined
      if (!call || !candidate || !assignment) return

      setAssignments((current) => current.map((item) => (item.leg.flightId === call.legId ? withSeat(item, call.role, candidate) : item)))
      setSickCalls((current) => current.map((item) => (item.id === callId ? { ...item, replacementId: candidate.id } : item)))
      setUpdateNote(
        `${candidate.name} replaced ${call.removed.name} on ${assignment.leg.flightNumber} (${call.removed.reason.toLowerCase()}). Both were re-notified (Feature 13).`,
      )
      setSelectedId(null)
      setFixNotice(null)
    },
    [assignments, sickCalls],
  )

  /**
   * Feature 2.
   *
   * The delay is written onto the leg rather than kept beside it, so the report time
   * moves and the rest rule re-computes — the operator watches the arithmetic get
   * worse instead of being told it has. Once a leg has been delayed, later edits keep
   * the shifted times, and the button cannot push the same leg twice.
   */
  const delayFlight = useCallback((legId: string) => {
    setAssignments((current) =>
      current.map((assignment) =>
        assignment.leg.flightId === legId ? { ...assignment, leg: shiftLeg(assignment.leg, DEMO_DELAY_MINUTES) } : assignment,
      ),
    )
    setDelayed((current) => (current?.legId === legId ? current : { legId, minutes: DEMO_DELAY_MINUTES }))
  }, [])

  const rosterFor = useCallback((legId: string) => assignments.find((assignment) => assignment.leg.flightId === legId), [assignments])

  // A delayed leg only stays in the strip while it is still the reason something is
  // open; once the operator fixes what the delay broke, the notice has done its job.
  const banner = useMemo<PageBanner | null>(() => {
    if (delayed) {
      const flight = rosterFor(delayed.legId)?.leg
      const disturbed = openBreaks.find((item) => item.legId === delayed.legId)
      if (flight && disturbed) {
        const rest = disturbed.facts.find((fact) => fact.label === 'Rest between duties')?.value
        return {
          tone: 'info',
          text:
            `Flight change from Feature 2 · ${flight.flightNumber} now leaves at ${shiftTime(flight.departureAt, delayed.minutes)} ` +
            `(+${delayed.minutes / 60} h). Affected legs were re-checked: ${disturbed.code} is still open` +
            `${rest ? ` (${rest.toLowerCase().replace(' · ', ', ')})` : ''}.`,
        }
      }
    }

    if (status === 'published') {
      const uncovered = openBreaks.find((item) => item.code === 'SICK_CALL')
      if (uncovered) {
        return {
          tone: 'warning',
          text:
            `Roster published · ${uncovered.flightNumber} not covered: no captain passes every rule (NO_LEGAL_CREW). ` +
            `Affected crew re-notified.`,
        }
      }
      if (updateNote) return { tone: 'success', text: `Roster updated · ${updateNote}` }
      const legs = assignments.length
      const range = formatDateRange(MOCK_ROSTER_RUN.dateFrom, MOCK_ROSTER_RUN.dateTo)
      return { tone: 'success', text: `Roster published · ${range} · ${legs} legs · every crew member has been notified (Feature 13).` }
    }

    if (openBreaks.length === 0 && closed.length > 0) {
      const fixed = closed.filter((item) => item.resolution?.kind === 'fixed').length
      const overridden = closed.length - fixed
      return {
        tone: 'success',
        text:
          overridden > 0
            ? `All breaks closed · ${fixed} fixed, ${overridden} overridden with a reason. The roster is ready to publish.`
            : 'All breaks fixed · the roster is legal and ready to publish.',
      }
    }

    return null
  }, [assignments, closed, delayed, openBreaks, rosterFor, status, updateNote])

  const heading = useMemo(() => {
    const open = openBreaks.find((item) => item.code === 'SICK_CALL')
    if (!open) return openBreaks.length > 0 ? 'Open breaks' : null
    return open.replacement?.allowedCount === 0 ? 'Uncovered leg' : 'Sick call'
  }, [openBreaks])

  return {
    assignments,
    breaks,
    openBreaks,
    selectedBreak,
    selectBreak: setSelectedId,
    status,
    rosterStatusLabel: status === 'published' ? 'Published' : 'Draft',
    heading,
    totalItems: numbered.known.size,
    fixNotice,
    banner,
    delayMinutes: delayed?.minutes ?? 0,
    delayedLegId: delayed?.legId ?? null,
    delayFlight,
    canPublish,
    publishChecks,
    publish,
    swapIn,
    overrideBreak,
    isUpdated: sickCalls.some((call) => call.replacementId !== undefined),
    sickCalls,
    raiseSickCall,
    coverSeat,
    rosterFor,
    uncoveredLegIds,
  }
}

/** `12:30` shifted by the delay, for the Feature 2 notice. */
function shiftTime(instant: string, minutes: number): string {
  return formatTime(shiftInstant(instant, minutes))
}

function shiftInstant(instant: string, minutes: number): string {
  return new Date(new Date(instant).getTime() + minutes * 60_000).toISOString()
}

function shiftLeg(leg: LegAssignment['leg'], minutes: number): LegAssignment['leg'] {
  return {
    ...leg,
    departureAt: shiftInstant(leg.departureAt, minutes),
    arrivalAt: shiftInstant(leg.arrivalAt, minutes),
  }
}

/** What closed an item, in the three places it gets printed. */
function resolutionFor(target: FixBreak, candidate: CrewMember, outgoing: CrewMember | null, destination: string): Resolution {
  switch (target.code) {
    case 'POLICE_MIN':
      return {
        kind: 'fixed',
        summary: `${candidate.name} added · ${target.flightNumber} has ${POLICE_PER_INTERNATIONAL_LEG} of ${POLICE_PER_INTERNATIONAL_LEG} police`,
        short: CLOSED_VERB.police,
        banner:
          `${target.code} fixed · ${candidate.name} added to ${target.flightNumber} as police ` +
          `(${POLICE_PER_INTERNATIONAL_LEG} of ${POLICE_PER_INTERNATIONAL_LEG}). Re-checked: all rules pass.`,
      }
    case 'NO_LOCAL_CREW': {
      const language = DESTINATION_LANGUAGES[destination]?.label ?? 'local'
      return {
        kind: 'fixed',
        summary: `${candidate.name} swapped in · ${target.flightNumber} has a ${language} speaker`,
        short: CLOSED_VERB.local,
        banner: `${target.code} fixed · ${candidate.name} swapped onto ${target.flightNumber}, so it has a ${language} speaker. Re-checked: all rules pass.`,
      }
    }
    default:
      return {
        kind: 'fixed',
        summary: `${candidate.name} ${CREWED_VERB[target.seatRole]} ${target.pairingId}`,
        short: CLOSED_VERB[target.seatRole],
        banner:
          `${target.code} fixed · ${candidate.name} replaced ${outgoing?.name ?? 'nobody'} as ` +
          `${SEAT_LABEL[target.seatRole].toLowerCase()} on ${target.pairingId}. Re-checked: all rules pass.`,
      }
  }
}

function checksFor(
  assignments: readonly LegAssignment[],
  breaks: readonly FixBreak[],
  status: RosterStatus,
  sickCalls: readonly SickCall[],
): PublishCheck[] {
  const byPairing = new Map<string, LegAssignment[]>()
  for (const assignment of assignments) byPairing.set(assignment.pairingId, [...(byPairing.get(assignment.pairingId) ?? []), assignment])

  return [...byPairing.entries()].map(([pairingId, legs]) => {
    const ordered = [...legs].sort((a, b) => a.leg.departureAt.localeCompare(b.leg.departureAt))
    const first = ordered[0]
    const last = ordered.at(-1)
    const broken = breaks.some((item) => item.pairingId === pairingId && item.resolution === undefined)
    const uncoveredLeg = ordered.find(
      (assignment) =>
        sickCalls.some((call) => call.legId === assignment.leg.flightId && call.replacementId === undefined) && assignment.captain === null,
    )
    const route = [first?.leg.origin ?? '—', ...ordered.map((assignment) => assignment.leg.destination)].join(' → ')

    const dateLabel =
      first && last && localDateKey(first.leg.departureAt) === localDateKey(last.leg.arrivalAt)
        ? formatFullDay(first.leg.departureAt)
        : first && last
          ? formatDateRange(localDateKey(first.leg.departureAt), localDateKey(last.leg.arrivalAt))
          : '—'

    const detail = uncoveredLeg
      ? `${route} · ${uncoveredLeg.leg.flightNumber} has no captain (NO_LEGAL_CREW)`
      : `${route} · ${broken ? 'has a rule break' : 'all checks clear'}`

    return {
      pairingId,
      dateLabel,
      base: first?.leg.origin ?? '—',
      detail,
      status: uncoveredLeg ? 'Not covered' : status === 'published' ? 'Published ✓' : broken ? 'Rule break' : 'Ready to publish',
      tone: uncoveredLeg || broken ? ('bad' as const) : ('good' as const),
    }
  })
}
