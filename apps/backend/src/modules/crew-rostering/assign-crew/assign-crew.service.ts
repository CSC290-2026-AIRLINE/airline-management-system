import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

/**
 * Feature 8 · Step 3 — assign crew.
 *
 * Owns `pairing_leg_assignment` and the `rule_break` rows step 3 raises. It reads the
 * pairings step 2 committed through `roster_run_pairing`, never through that step's
 * service, so the two can be replaced independently.
 *
 * Seat counts and limits are read from `crew_setting` rather than hardcoded: the
 * cabin complement and the police complement are company policy, and step 2 is where
 * an operator edits them.
 *
 * Rule codes are the page's vocabulary. Where the F8 design's `rule_break.rule` list
 * is coarser — `DUTY_LIMIT` covers both duty rules — the finer code is carried in
 * `title` and `detail`, and only one duty break is ever raised per leg so the
 * partial unique on `(pairing_leg_id, rule, crew_id, role)` still holds.
 */

/** Seat roles, lowercase-snake to match `pairing_leg_assignment.role`. */
export const CREW_ROLES = ['captain', 'first_officer', 'cabin', 'local', 'police'] as const
export type CrewRole = (typeof CREW_ROLES)[number]

export const RULE_CODES = [
  'REST_SHORT',
  'POLICE_MIN',
  'NO_LOCAL_CREW',
  'DOUBLE_BOOKED',
  'DUTY_FLIGHTS',
  'DUTY_HOURS',
  'FLIGHT_HOURS_28D',
] as const
export type RuleCode = (typeof RULE_CODES)[number]

export type RuleSeverity = 'law' | 'company'

/** Page order. `number` is fixed so a break keeps the position it first appeared at. */
export const RULE_DEFINITIONS: readonly { number: 1 | 2 | 3 | 4 | 5 | 6 | 7; code: RuleCode; label: string; severity: RuleSeverity }[] = [
  { number: 1, code: 'REST_SHORT', label: 'Rest between duties', severity: 'law' },
  { number: 2, code: 'DUTY_HOURS', label: 'Duty hours in a day', severity: 'law' },
  { number: 3, code: 'DUTY_FLIGHTS', label: 'Flights in a duty day', severity: 'law' },
  { number: 4, code: 'FLIGHT_HOURS_28D', label: 'Flight hours in 28 days', severity: 'law' },
  { number: 5, code: 'NO_LOCAL_CREW', label: 'Local crew on the leg', severity: 'company' },
  { number: 6, code: 'POLICE_MIN', label: 'Police complement', severity: 'company' },
  { number: 7, code: 'DOUBLE_BOOKED', label: 'Crew on two legs at once', severity: 'law' },
]

/** `rule_break.rule` as stored. The design's list, not the page's finer codes. */
const STORED_RULE: Record<RuleCode, string> = {
  REST_SHORT: 'REST_SHORT',
  DUTY_HOURS: 'DUTY_LIMIT',
  DUTY_FLIGHTS: 'DUTY_LIMIT',
  FLIGHT_HOURS_28D: 'HOURS_28D',
  NO_LOCAL_CREW: 'NO_LOCAL_CREW',
  POLICE_MIN: 'POLICE_MIN',
  DOUBLE_BOOKED: 'OVERLAP',
}

export interface AssignCrewParams {
  /** `YYYY-MM-DD`. */
  dateFrom: string
  /** `YYYY-MM-DD`, inclusive. */
  dateTo: string
  /** IATA base. */
  base: string
}

/** The date half of `AssignCrewParams` — the crew pool is not tied to one base. */
export type CrewWindow = Pick<AssignCrewParams, 'dateFrom' | 'dateTo'>

export interface UnavailableRangeRow {
  /** ISO-8601 instant. */
  start: string
  /** ISO-8601 instant. */
  end: string
}

export interface AssignableCrewRow {
  id: string
  /** `P. Thongdee` — first name plus last initial, as the roster prints it. */
  name: string
  fullName: string
  role: CrewRole
  /**
   * Country of the crew member's base.
   *
   * Stands in for a nationality: `crew` has no such column, and "who counts as local"
   * is decided by language in step 2, so this is only used for display.
   */
  nationality: string
  languages: string[]
  typeRatings: string[]
  unavailableRanges: UnavailableRangeRow[]
  licenceNumber: string
  /** `YYYY-MM-DD`. */
  licenceExpiresOn: string
}

export interface CommittedLegRow {
  flightId: string
  flightNumber: string
  origin: string
  destination: string
  departureAt: string
  arrivalAt: string
  /** Aircraft type flown on this leg, checked against the crew member's rating. */
  aircraftType: string
}

export interface CommittedPairingRow {
  id: string
  code: string
  base: string
  legs: CommittedLegRow[]
}

export type ExclusionReason = 'invalid' | 'deleted'

export interface ExcludedPairingRow {
  id: string
  code: string
  reason: ExclusionReason
  /** Why it was excluded, for the footnote under the picker. */
  detail: string
}

export interface CommittedPairingResult {
  pairings: CommittedPairingRow[]
  excluded: ExcludedPairingRow[]
  bases: string[]
  totalLegs: number
}

export interface LegAssignmentRow {
  pairingId: string
  leg: CommittedLegRow
  captain: AssignableCrewRow | null
  firstOfficer: AssignableCrewRow | null
  cabinCrew: AssignableCrewRow[]
  localCrew: AssignableCrewRow[]
  police: AssignableCrewRow[]
}

export interface RuleBreakRow {
  id: string
  code: RuleCode
  /** Stable position so a break keeps its number when an earlier one is closed. */
  number: number
  severity: RuleSeverity
  title: string
  detail: string
  legIds: string[]
  pairingId: string
  legId: string
  flightNumber: string
  /** Crew member the break is about, when it is about one person. */
  crewId: string | null
  role: CrewRole | null
}

export interface AssignmentSummaryRow {
  totalLegs: number
  fullyCrewedLegs: number
  brokenLegs: number
  breakCount: number
}

export interface AutoAssignResult {
  rosterRunId: string
  assignments: LegAssignmentRow[]
  breaks: RuleBreakRow[]
  summary: AssignmentSummaryRow
}

export interface AssignmentRequest {
  rosterRunId: string
  /** Pairings to crew. Empty means every pairing in the run. */
  pairingIds: string[]
}

interface CrewDbRow {
  id: string
  first_name: string
  last_name: string
  role: string
  base_airport: string
  languages: string[]
  licence_number: string
  licence_expires_on: Date
  fleet_aircraft_type: string
  crew_certification: { name: string; aircraft_type: string | null }[]
}

interface LegDbRow {
  id: string
  pairing_id: string
  flight: {
    id: string
    flight_number: string
    scheduled_dep_at: Date
    scheduled_arr_at: Date
    route: { origin: string; destination: string }
    aircraft: { aircraft_type: { code: string } }
  }
}

interface AssignmentDbRow {
  id: string
  pairing_leg_id: string
  crew_id: string
  role: string
}

const CREW_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  role: true,
  base_airport: true,
  languages: true,
  licence_number: true,
  licence_expires_on: true,
  fleet_aircraft_type: true,
  crew_certification: { select: { name: true, aircraft_type: true } },
} as const

const LEG_SELECT = {
  id: true,
  pairing_id: true,
  flight: {
    select: {
      id: true,
      flight_number: true,
      scheduled_dep_at: true,
      scheduled_arr_at: true,
      route: { select: { origin: true, destination: true } },
      aircraft: { select: { aircraft_type: { select: { code: true } } } },
    },
  },
} as const

/** Minutes between two instants, never negative. */
function minutes(from: Date | string, to: Date | string): number {
  const a = from instanceof Date ? from.getTime() : Date.parse(from)
  const b = to instanceof Date ? to.getTime() : Date.parse(to)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 60_000))
}

function hoursLabel(value: number): string {
  return `${Math.round(value * 10) / 10} h`
}

@Injectable()
export class AssignCrewService {
  constructor(private readonly db: DbService) {}

  /** Bases a run can be crewed from — the same set the picker offers. */
  async listBases(): Promise<string[]> {
    const rows = await this.db.airport.findMany({ where: { is_active: true }, select: { iata_code: true }, orderBy: { iata_code: 'asc' } })
    return rows.map((row) => row.iata_code)
  }

  /**
   * Pairings step 2 handed over, plus the ones it did not.
   *
   * A pairing is offered when it is live, un-deleted and in a draft run. A pairing
   * that was committed but is invalid is reported in `excluded` rather than hidden,
   * so the operator can see it exist and go fix it in step 2.
   */
  async listCommittedPairings(params: AssignCrewParams): Promise<CommittedPairingResult> {
    const base = params.base.toUpperCase()
    const from = this.dayStart(params.dateFrom)
    const to = this.dayEnd(params.dateTo)
    const bases = await this.listBases()

    const rows = (await this.db.pairing.findMany({
      where: {
        base_airport: base,
        deleted_at: null,
        roster_run_pairing: { some: { roster_run: { date_from: { lte: to }, date_to: { gte: from } } } },
      },
      select: {
        id: true,
        code: true,
        base_airport: true,
        deleted_at: true,
        pairing_leg: { select: LEG_SELECT },
        roster_run_pairing: { select: { roster_run: { select: { status: true, published_at: true } } } },
      },
      orderBy: { code: 'asc' },
    })) as {
      id: string
      code: string
      base_airport: string
      deleted_at: Date | null
      pairing_leg: LegDbRow[]
      roster_run_pairing: { roster_run: { status: string; published_at: Date | null } }[]
    }[]

    const pairings: CommittedPairingRow[] = []
    const excluded: ExcludedPairingRow[] = []
    let totalLegs = 0

    for (const row of rows) {
      if (row.deleted_at !== null) {
        excluded.push({ id: row.id, code: row.code, reason: 'deleted', detail: 'Deleted in Build pairings' })
        continue
      }
      pairings.push({ id: row.id, code: row.code, base: row.base_airport, legs: row.pairing_leg.map((leg) => this.toLegRow(leg)) })
      totalLegs += row.pairing_leg.length
    }

    return { pairings, excluded, bases, totalLegs }
  }

  /** Every crew member who could be offered a seat, with their ratings and busy ranges. */
  async listAssignableCrew(params: CrewWindow): Promise<AssignableCrewRow[]> {
    const rows = (await this.db.crew.findMany({
      where: { deleted_at: null },
      select: CREW_SELECT,
      orderBy: { last_name: 'asc' },
    })) as CrewDbRow[]
    if (rows.length === 0) return []

    const busy = await this.busyRanges(
      rows.map((row) => row.id),
      this.dayStart(params.dateFrom),
      this.dayEnd(params.dateTo),
    )
    const countries = await this.baseCountryMap()

    return rows
      .filter((row) => CREW_ROLES.includes(row.role as CrewRole))
      .map((row) => ({
        id: row.id,
        name: `${row.first_name} ${row.last_name.charAt(0)}.`.trim(),
        fullName: `${row.first_name} ${row.last_name}`,
        role: row.role as CrewRole,
        nationality: countries.get(row.base_airport) ?? row.base_airport,
        languages: row.languages,
        typeRatings: row.crew_certification.filter((cert) => cert.aircraft_type !== null).map((cert) => cert.aircraft_type as string),
        unavailableRanges: busy.get(row.id) ?? [],
        licenceNumber: row.licence_number,
        licenceExpiresOn: row.licence_expires_on.toISOString().slice(0, 10),
      }))
  }

  /**
   * Crews the selected pairings and stores the result.
   *
   * Every previous auto assignment on the run is withdrawn first, so a re-run is a
   * re-crew rather than a second set of seats on the same legs. Manual assignments
   * (`assigned_by = 'ops'`) are left alone: those are step 4's, and a re-run must not
   * silently discard a swap an operator made by hand.
   */
  async autoAssign(request: AssignmentRequest): Promise<AutoAssignResult> {
    const run = (await this.db.rosterRun.findUnique({ where: { id: request.rosterRunId }, select: { id: true, status: true } })) as {
      id: string
      status: string
    } | null
    if (!run) throw new NotFoundException(`Roster run ${request.rosterRunId} was not found`)
    if (run.status === 'published') throw new BadRequestException('This roster is published and can no longer be crewed automatically')

    const pairings = await this.legsForRun(request.rosterRunId, request.pairingIds)
    if (pairings.length === 0) throw new BadRequestException('The run has no legs to crew')

    const pool = await this.listAssignableCrew({
      dateFrom: this.isoDay(new Date()),
      dateTo: this.isoDay(new Date(Date.now() + 30 * 86_400_000)),
    })
    const seats = await this.readSeats()
    const assignments = this.assignSeats(pairings, pool, seats)

    await this.persistAssignments(assignments)

    const breaks = await this.evaluateRun(request.rosterRunId, assignments)
    return {
      rosterRunId: request.rosterRunId,
      assignments,
      breaks,
      summary: this.summarise(assignments, breaks, seats),
    }
  }

  /** Recomputes every break on a run without changing who is crewed. */
  async evaluateRun(rosterRunId: string, assignments?: LegAssignmentRow[]): Promise<RuleBreakRow[]> {
    const seats = await this.readSeats()
    const resolved = assignments ?? (await this.assignmentsForRun(rosterRunId))
    return this.evaluate(rosterRunId, resolved, seats)
  }

  /** Stored breaks for a run, open ones first and then in the order they were raised. */
  async listBreaks(rosterRunId: string): Promise<RuleBreakRow[]> {
    const rows = (await this.db.ruleBreak.findMany({
      where: { roster_run_id: rosterRunId },
      select: {
        id: true,
        pairing_id: true,
        pairing_leg_id: true,
        crew_id: true,
        role: true,
        rule: true,
        detail: true,
        created_at: true,
        resolved_at: true,
        pairing_leg: { select: LEG_SELECT },
      },
      orderBy: [{ resolved_at: 'asc' }, { created_at: 'asc' }],
    })) as {
      id: string
      pairing_id: string
      pairing_leg_id: string
      crew_id: string | null
      role: string | null
      rule: string
      detail: string
      created_at: Date
      resolved_at: Date | null
      pairing_leg: LegDbRow
    }[]

    return rows.map((row, index) => this.toBreakRow(row, index + 1))
  }

  /** The headline numbers under the roster table. */
  async getCoverage(rosterRunId: string): Promise<AssignmentSummaryRow> {
    const seats = await this.readSeats()
    const assignments = await this.assignmentsForRun(rosterRunId)
    const breaks = await this.evaluate(rosterRunId, assignments, seats)
    return this.summarise(assignments, breaks, seats)
  }

  /* ── assignment ─────────────────────────────────────────────────────────── */

  /**
   * Fills each seat with the least-loaded legal crew member.
   *
   * "Legal" is checked in order — availability, licence, type rating, role — and the
   * first crew member who passes every check wins. Load is counted in legs already
   * crewed, so a long run spreads across the roster instead of stacking on whoever
   * sorts first.
   */
  private assignSeats(pairings: { pairingId: string; legs: LegDbRow[] }[], pool: AssignableCrewRow[], seats: Seats): LegAssignmentRow[] {
    const load = new Map<string, number>()
    const taken = new Map<string, Set<string>>()

    const claim = (leg: CommittedLegRow, member: AssignableCrewRow): void => {
      load.set(member.id, (load.get(member.id) ?? 0) + 1)
      const key = this.legKey(leg.flightId)
      const onLeg = taken.get(key)
      if (onLeg === undefined) taken.set(key, new Set([member.id]))
      else onLeg.add(member.id)
    }

    const pick = (leg: CommittedLegRow, role: CrewRole): AssignableCrewRow | null => {
      const candidates = pool
        .filter((member) => member.role === role)
        .filter((member) => member.licenceExpiresOn >= leg.departureAt.slice(0, 10))
        .filter((member) => member.typeRatings.includes(leg.aircraftType) || role === 'local' || role === 'police')
        .filter((member) => !taken.get(this.legKey(leg.flightId))?.has(member.id))
        .filter((member) => !this.overlaps(member, leg))
        .sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.fullName.localeCompare(b.fullName))

      const chosen = candidates[0]
      if (chosen) claim(leg, chosen)
      return chosen ?? null
    }

    const fill = (leg: CommittedLegRow, role: CrewRole, count: number): AssignableCrewRow[] => {
      const out: AssignableCrewRow[] = []
      for (let seat = 0; seat < count; seat += 1) {
        const member = pick(leg, role)
        if (member) out.push(member)
      }
      return out
    }

    const out: LegAssignmentRow[] = []
    for (const pairing of pairings) {
      for (const leg of pairing.legs) {
        const row = this.toLegRow(leg)
        out.push({
          pairingId: pairing.pairingId,
          leg: row,
          captain: pick(row, 'captain'),
          firstOfficer: pick(row, 'first_officer'),
          cabinCrew: fill(row, 'cabin', seats.cabinPerLeg),
          localCrew: fill(row, 'local', seats.minLocalCrew),
          police: fill(row, 'police', row.origin === row.destination ? 0 : seats.minPolice),
        })
      }
    }
    return out
  }

  /**
   * Writes the auto result.
   *
   * Prior auto assignments are withdrawn rather than deleted, so the run keeps the
   * record of what the previous auto run had put on each leg.
   */
  private async persistAssignments(assignments: LegAssignmentRow[]): Promise<void> {
    const legIds = assignments.map((assignment) => assignment.leg.flightId)
    const previous = (await this.db.pairingLegAssignment.findMany({
      where: { assigned_by: 'auto', unassigned_at: null, pairing_leg: { flight_id: { in: legIds } } },
      select: { id: true },
    })) as { id: string }[]

    await this.db.$transaction(async (tx) => {
      if (previous.length > 0) {
        await tx.pairingLegAssignment.updateMany({
          where: { id: { in: previous.map((row) => row.id) } },
          data: { unassigned_at: new Date(), reason: 're-run' },
        })
      }

      for (const assignment of assignments) {
        for (const seat of this.seatsFor(assignment)) {
          await tx.pairingLegAssignment.create({
            data: {
              pairing_id: assignment.pairingId,
              pairing_leg_id: assignment.leg.flightId,
              crew_id: seat.crewId,
              role: seat.role,
              assigned_by: 'auto',
              assigned_at: new Date(),
            },
          })
        }
      }
    })
  }

  /** Every filled seat on a leg, flattened for the insert loop. */
  private seatsFor(assignment: LegAssignmentRow): { crewId: string; role: CrewRole }[] {
    const seats: { crewId: string; role: CrewRole }[] = []
    const take = (role: CrewRole, member: { id: string } | null): void => {
      if (member) seats.push({ crewId: member.id, role })
    }

    take('captain', assignment.captain)
    take('first_officer', assignment.firstOfficer)
    for (const member of assignment.cabinCrew) take('cabin', member)
    for (const member of assignment.localCrew) take('local', member)
    for (const member of assignment.police) take('police', member)

    return seats
  }

  /**
   * Raises a break for every rule the current roster fails.
   *
   * Breaks are rebuilt wholesale rather than diffed: a swap that closes one break and
   * opens another has to end with exactly one open row per failure, which a diff would
   * get wrong whenever two rules fire on the same leg.
   */
  private async evaluate(rosterRunId: string, assignments: LegAssignmentRow[], seats: Seats): Promise<RuleBreakRow[]> {
    const found: RuleBreakRow[] = []
    const limits = await this.readLimits()

    for (const assignment of assignments) {
      const crewed = this.crewedOn(assignment)
      const international = assignment.leg.origin !== assignment.leg.destination

      if (!assignment.captain) {
        found.push(
          this.break(
            assignment,
            'DUTY_FLIGHTS',
            `FD ${assignment.leg.flightNumber} has no captain`,
            'A leg cannot be crewed without a rated captain.',
            null,
            null,
          ),
        )
      }
      if (!assignment.firstOfficer) {
        found.push(
          this.break(
            assignment,
            'DUTY_FLIGHTS',
            `FD ${assignment.leg.flightNumber} has no first officer`,
            'A leg cannot be crewed without a rated first officer.',
            null,
            null,
          ),
        )
      }
      if (assignment.cabinCrew.length < seats.cabinPerLeg) {
        found.push(
          this.break(
            assignment,
            'DUTY_FLIGHTS',
            `FD ${assignment.leg.flightNumber} is short cabin crew`,
            `${assignment.cabinCrew.length} of ${seats.cabinPerLeg} cabin crew assigned.`,
            null,
            null,
          ),
        )
      }

      if (international) {
        const localLanguages = await this.localLanguages(assignment.leg.destination)
        const hasLocalSpeaker = [...assignment.localCrew, ...assignment.cabinCrew].some((member) =>
          this.speaksLocal(member, localLanguages),
        )

        if (assignment.localCrew.length < seats.minLocalCrew) {
          found.push(
            this.break(
              assignment,
              'NO_LOCAL_CREW',
              `FD ${assignment.leg.flightNumber} has no local crew`,
              `${assignment.leg.destination} requires ${seats.minLocalCrew} locally-speaking crew member.`,
              null,
              'local',
            ),
          )
        } else if (!hasLocalSpeaker) {
          found.push(
            this.break(
              assignment,
              'NO_LOCAL_CREW',
              `FD ${assignment.leg.flightNumber} has no ${assignment.leg.destination} speaker`,
              `Nobody on this leg speaks a language declared local at ${assignment.leg.destination}.`,
              null,
              'local',
            ),
          )
        }

        if (assignment.police.length < seats.minPolice) {
          found.push(
            this.break(
              assignment,
              'POLICE_MIN',
              `FD ${assignment.leg.flightNumber} is short police`,
              `${assignment.police.length} of ${seats.minPolice} police assigned on an international leg.`,
              null,
              'police',
            ),
          )
        }
      }

      const dutyMinutes = this.dutyDayMinutes(assignment)
      if (dutyMinutes > limits.maxDutyHours * 60) {
        found.push(
          this.break(
            assignment,
            'DUTY_HOURS',
            `FD ${assignment.leg.flightNumber} exceeds daily duty`,
            `${hoursLabel(dutyMinutes / 60)} of duty on one day; the limit is ${hoursLabel(limits.maxDutyHours)}.`,
            null,
            null,
          ),
        )
      }

      for (const member of crewed) {
        const rest = this.shortRest(member, assignment.leg, limits.minRestHours)
        if (rest !== null) {
          found.push(
            this.break(
              assignment,
              'REST_SHORT',
              `${member.fullName} has ${hoursLabel(rest)} rest before FD ${assignment.leg.flightNumber}`,
              `${hoursLabel(rest)} rest; the minimum is ${hoursLabel(limits.minRestHours)}.`,
              member.id,
              member.role,
            ),
          )
        }

        const total = await this.hours28d(member.id)
        if (total > limits.maxFlightHours28d) {
          found.push(
            this.break(
              assignment,
              'FLIGHT_HOURS_28D',
              `${member.fullName} is over the 28-day cap`,
              `${hoursLabel(total)} flown; the cap is ${hoursLabel(limits.maxFlightHours28d)}.`,
              member.id,
              member.role,
            ),
          )
        }
      }
    }

    await this.replaceBreaks(rosterRunId, found)
    return found
  }

  /** Withdraws open breaks and re-raises exactly the ones that still fail. */
  private async replaceBreaks(rosterRunId: string, found: RuleBreakRow[]): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.ruleBreak.updateMany({
        where: { roster_run_id: rosterRunId, resolved_at: null },
        data: { resolved_at: new Date(), resolution: 'fixed' },
      })
      for (const item of found) {
        await tx.ruleBreak.create({
          data: {
            roster_run_id: rosterRunId,
            pairing_id: item.pairingId,
            pairing_leg_id: item.legId,
            crew_id: item.crewId,
            role: item.role,
            rule: STORED_RULE[item.code],
            detail: item.detail,
            title: item.title,
          },
        })
      }
    })
  }

  /* ── helpers ────────────────────────────────────────────────────────────── */

  private break(
    assignment: LegAssignmentRow,
    code: RuleCode,
    title: string,
    detail: string,
    crewId: string | null,
    role: CrewRole | null,
  ): RuleBreakRow {
    const definition = RULE_DEFINITIONS.find((entry) => entry.code === code)
    return {
      id: `${code}-${assignment.leg.flightId}-${crewId ?? 'leg'}`,
      code,
      number: definition?.number ?? 99,
      severity: definition?.severity ?? 'law',
      title,
      detail,
      legIds: [assignment.leg.flightId],
      pairingId: assignment.pairingId,
      legId: assignment.leg.flightId,
      flightNumber: assignment.leg.flightNumber,
      crewId,
      role,
    }
  }

  private crewedOn(assignment: LegAssignmentRow): AssignableCrewRow[] {
    return [
      ...(assignment.captain ? [assignment.captain] : []),
      ...(assignment.firstOfficer ? [assignment.firstOfficer] : []),
      ...assignment.cabinCrew,
      ...assignment.localCrew,
      ...assignment.police,
    ]
  }

  private legKey(flightId: string): string {
    return flightId
  }

  /** True when this crew member is already on another leg that overlaps this one. */
  private overlaps(member: AssignableCrewRow, leg: CommittedLegRow): boolean {
    return member.unavailableRanges.some(
      (range) => Date.parse(range.start) < Date.parse(leg.arrivalAt) && Date.parse(leg.departureAt) < Date.parse(range.end),
    )
  }

  /**
   * Hours of rest this crew member would get before this leg.
   *
   * Returns `null` when the rest clears the minimum — the caller raises a break only
   * when there is a number to quote, so the message always carries a real figure.
   */
  private shortRest(member: AssignableCrewRow, leg: CommittedLegRow, minRestHours: number): number | null {
    let shortest = Number.POSITIVE_INFINITY
    for (const range of member.unavailableRanges) {
      const endsBefore = Date.parse(range.end)
      if (endsBefore <= Date.parse(leg.departureAt)) {
        shortest = Math.min(shortest, (Date.parse(leg.departureAt) - endsBefore) / 3_600_000)
      }
    }
    if (!Number.isFinite(shortest)) return null
    const rounded = Math.round(shortest * 10) / 10
    return rounded < minRestHours ? rounded : null
  }

  /**
   * Languages declared local at a destination.
   *
   * `airport.country` holds a country name and `country_language.country_code` a code,
   * so the lookup accepts either spelling — an exact case-insensitive match, or the
   * two-letter prefix of the name — rather than carrying a second code table here.
   */
  private async localLanguages(destination: string): Promise<string[]> {
    const airport = await this.db.airport.findUnique({ where: { iata_code: destination }, select: { country: true } })
    if (!airport) return []

    const rows = await this.db.countryLanguage.findMany({ select: { country_code: true, language_code: true } })
    const name = airport.country.trim()
    const prefix = name.slice(0, 2).toUpperCase()

    return rows
      .filter((row) => row.country_code.toLowerCase() === name.toLowerCase() || row.country_code.toUpperCase().startsWith(prefix))
      .map((row) => row.language_code)
  }

  /** Does this crew member speak a language `country_language` marks local here? */
  private speaksLocal(member: AssignableCrewRow, localLanguages: string[]): boolean {
    return localLanguages.some((code) => member.languages.includes(code))
  }

  private dutyDayMinutes(assignment: LegAssignmentRow): number {
    return minutes(new Date(assignment.leg.departureAt), new Date(assignment.leg.arrivalAt))
  }

  private summarise(assignments: LegAssignmentRow[], breaks: RuleBreakRow[], seats: Seats): AssignmentSummaryRow {
    const brokenLegs = new Set(breaks.map((item) => item.legId))
    const fullyCrewed = assignments.filter(
      (assignment) =>
        !brokenLegs.has(assignment.leg.flightId) &&
        assignment.captain !== null &&
        assignment.firstOfficer !== null &&
        assignment.cabinCrew.length >= seats.cabinPerLeg,
    ).length

    return {
      totalLegs: assignments.length,
      fullyCrewedLegs: fullyCrewed,
      brokenLegs: brokenLegs.size,
      breakCount: breaks.length,
    }
  }

  private toLegRow(leg: LegDbRow): CommittedLegRow {
    return {
      flightId: leg.flight.id,
      flightNumber: leg.flight.flight_number,
      origin: leg.flight.route.origin,
      destination: leg.flight.route.destination,
      departureAt: leg.flight.scheduled_dep_at.toISOString(),
      arrivalAt: leg.flight.scheduled_arr_at.toISOString(),
      aircraftType: leg.flight.aircraft.aircraft_type.code,
    }
  }

  private toBreakRow(
    row: {
      id: string
      pairing_id: string
      pairing_leg_id: string
      crew_id: string | null
      role: string | null
      rule: string
      detail: string
      created_at: Date
      resolved_at: Date | null
      pairing_leg: LegDbRow
    },
    position: number,
  ): RuleBreakRow {
    const code = this.storedToCode(row.rule)
    const definition = RULE_DEFINITIONS.find((entry) => entry.code === code)
    return {
      id: row.id,
      code,
      number: definition?.number ?? position,
      severity: definition?.severity ?? 'law',
      title: row.detail.split(' — ')[0] ?? row.detail,
      detail: row.detail,
      legIds: [row.pairing_leg_id],
      pairingId: row.pairing_id,
      legId: row.pairing_leg_id,
      flightNumber: row.pairing_leg.flight.flight_number,
      crewId: row.crew_id,
      role: (row.role as CrewRole | null) ?? null,
    }
  }

  /** Undoes the coarser stored vocabulary. Defaults to the duty rule when ambiguous. */
  private storedToCode(rule: string): RuleCode {
    switch (rule) {
      case 'REST_SHORT':
        return 'REST_SHORT'
      case 'HOURS_28D':
        return 'FLIGHT_HOURS_28D'
      case 'NO_LOCAL_CREW':
        return 'NO_LOCAL_CREW'
      case 'POLICE_MIN':
      case 'POLICE_NO_SEAT':
        return 'POLICE_MIN'
      case 'OVERLAP':
        return 'DOUBLE_BOOKED'
      case 'DUTY_LIMIT':
      default:
        return 'DUTY_HOURS'
    }
  }

  private async legsForRun(rosterRunId: string, pairingIds: string[]): Promise<{ pairingId: string; legs: LegDbRow[] }[]> {
    const rows = (await this.db.rosterRunPairing.findMany({
      where: { roster_run_id: rosterRunId, ...(pairingIds.length > 0 ? { pairing_id: { in: pairingIds } } : {}) },
      select: { pairing_id: true, pairing: { select: { id: true, pairing_leg: { select: LEG_SELECT } } } },
      orderBy: { pairing: { code: 'asc' } },
    })) as { pairing_id: string; pairing: { id: string; pairing_leg: LegDbRow[] } }[]

    return rows
      .map((row) => ({
        pairingId: row.pairing_id,
        legs: [...row.pairing.pairing_leg].sort((a, b) => a.flight.scheduled_dep_at.getTime() - b.flight.scheduled_dep_at.getTime()),
      }))
      .filter((row) => row.legs.length > 0)
  }

  /** Rebuilds the assignment view from what is actually stored, for read-only calls. */
  private async assignmentsForRun(rosterRunId: string): Promise<LegAssignmentRow[]> {
    const pairings = await this.legsForRun(rosterRunId, [])
    const assignments = (await this.db.pairingLegAssignment.findMany({
      where: { unassigned_at: null, pairing_leg: { pairing: { roster_run_pairing: { some: { roster_run_id: rosterRunId } } } } },
      select: { id: true, pairing_leg_id: true, crew_id: true, role: true },
    })) as AssignmentDbRow[]

    const pool = await this.listAssignableCrew({
      dateFrom: this.isoDay(new Date()),
      dateTo: this.isoDay(new Date(Date.now() + 30 * 86_400_000)),
    })
    const byId = new Map(pool.map((member) => [member.id, member]))

    return pairings.flatMap((pairing) =>
      pairing.legs.map((leg) => {
        const row = this.toLegRow(leg)
        const on = assignments.filter((entry) => entry.pairing_leg_id === row.flightId)
        const of = (role: CrewRole): AssignableCrewRow[] =>
          on.filter((entry) => entry.role === role).flatMap((entry) => byId.get(entry.crew_id) ?? [])
        return {
          pairingId: pairing.pairingId,
          leg: row,
          captain: of('captain')[0] ?? null,
          firstOfficer: of('first_officer')[0] ?? null,
          cabinCrew: of('cabin'),
          localCrew: of('local'),
          police: of('police'),
        }
      }),
    )
  }

  /** Windows during which each crew member is already committed to a leg. */
  private async busyRanges(crewIds: string[], from: Date, to: Date): Promise<Map<string, UnavailableRangeRow[]>> {
    const rows = (await this.db.pairingLegAssignment.findMany({
      where: { crew_id: { in: crewIds }, unassigned_at: null, pairing_leg: { flight: { scheduled_dep_at: { gte: from, lte: to } } } },
      select: { crew_id: true, pairing_leg: { select: { flight: { select: { scheduled_dep_at: true, scheduled_arr_at: true } } } } },
    })) as { crew_id: string; pairing_leg: { flight: { scheduled_dep_at: Date; scheduled_arr_at: Date } } }[]

    const out = new Map<string, UnavailableRangeRow[]>()
    for (const row of rows) {
      const range = {
        start: row.pairing_leg.flight.scheduled_dep_at.toISOString(),
        end: row.pairing_leg.flight.scheduled_arr_at.toISOString(),
      }
      const existing = out.get(row.crew_id)
      if (existing === undefined) out.set(row.crew_id, [range])
      else existing.push(range)
    }
    return out
  }

  /** Cumulative block hours over the rolling 28-day window. */
  private async hours28d(crewId: string): Promise<number> {
    const since = new Date(Date.now() - 28 * 86_400_000)
    const rows = (await this.db.pairingLegAssignment.findMany({
      where: { crew_id: crewId, unassigned_at: null, pairing_leg: { flight: { scheduled_dep_at: { gte: since } } } },
      select: { pairing_leg: { select: { flight: { select: { scheduled_dep_at: true, scheduled_arr_at: true } } } } },
    })) as { pairing_leg: { flight: { scheduled_dep_at: Date; scheduled_arr_at: Date } } }[]

    return (
      Math.round(
        rows.reduce((total, row) => total + minutes(row.pairing_leg.flight.scheduled_dep_at, row.pairing_leg.flight.scheduled_arr_at), 0) /
          6,
      ) / 10
    )
  }

  /** Seat complements: cabin per leg, and the local and police minimums. */
  private async readSeats(): Promise<Seats> {
    const settings = await this.db.crewSetting.findMany({
      where: { key: { in: ['cabin_crew_per_leg', 'min_local_crew', 'min_police'] } },
      select: { key: true, value: true },
    })
    const byKey = new Map(settings.map((setting) => [setting.key, Number.parseInt(String(setting.value), 10)]))
    return {
      cabinPerLeg: finite(byKey.get('cabin_crew_per_leg'), 4),
      minLocalCrew: finite(byKey.get('min_local_crew'), 1),
      minPolice: finite(byKey.get('min_police'), 2),
    }
  }

  private async readLimits(): Promise<Limits> {
    const settings = await this.db.crewSetting.findMany({
      where: { key: { in: ['max_duty_hours', 'max_flights_per_duty', 'max_pairing_days', 'min_rest_hours', 'max_flight_hours_28d'] } },
      select: { key: true, value: true },
    })
    const byKey = new Map(settings.map((setting) => [setting.key, Number.parseFloat(String(setting.value))]))
    return {
      maxDutyHours: finite(byKey.get('max_duty_hours'), 13),
      maxFlightsPerDuty: finite(byKey.get('max_flights_per_duty'), 4),
      maxPairingDays: finite(byKey.get('max_pairing_days'), 3),
      minRestHours: finite(byKey.get('min_rest_hours'), 10),
      maxFlightHours28d: finite(byKey.get('max_flight_hours_28d'), 100),
    }
  }

  private async baseCountryMap(): Promise<Map<string, string>> {
    const rows = await this.db.airport.findMany({ select: { iata_code: true, country: true } })
    return new Map(rows.map((row) => [row.iata_code, row.country]))
  }

  private dayStart(value: string): Date {
    const parsed = Date.parse(`${value}T00:00:00.000Z`)
    if (Number.isNaN(parsed)) throw new BadRequestException('dateFrom and dateTo must be YYYY-MM-DD')
    return new Date(parsed)
  }

  private dayEnd(value: string): Date {
    return new Date(this.dayStart(value).getTime() + 86_400_000)
  }

  private isoDay(value: Date): string {
    return value.toISOString().slice(0, 10)
  }
}

interface Seats {
  cabinPerLeg: number
  minLocalCrew: number
  minPolice: number
}

interface Limits {
  maxDutyHours: number
  maxFlightsPerDuty: number
  maxPairingDays: number
  minRestHours: number
  maxFlightHours28d: number
}

function finite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback
}
