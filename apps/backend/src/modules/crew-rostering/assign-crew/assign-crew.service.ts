import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { Prisma } from '@backend/db/generated/prisma/client'
import { LOCAL_MISS_RATE, POLICE_SHORT_RATE, pickOne } from './random-pick'

/**
 * Feature 8 · Step 3 — assign crew.
 *
 * Owns `pairing_leg_assignment` and the `rule_break` rows of a roster run. It reads the
 * pairings Build pairings committed through `roster_run_pairing`, never through that
 * step's service, so the two can be replaced independently.
 *
 * Decisions taken from the F8 migration (`20261024120000_feature8_crew_rostering`):
 *
 *  · **Seats are `crew.role`**: captain, first officer, cabin crew and police. There is no
 *    local-crew seat. "Local crew" is a cabin crew member who speaks a language
 *    `country_language` lists for the destination, and the auto-assigner prefers them
 *    for the cabin seats of an international pairing.
 *  · **A pairing is crewed as a whole**: the same people fly every leg, which is what a
 *    pairing is for. Rows are still written per leg, as the table requires.
 *  · **Re-check, not rebuild.** A check inserts the breaks it finds, closes the open ones
 *    it no longer finds as `fixed`, and never reopens one Ops has overridden.
 *  · Business timestamps (`assigned_at`, `resolved_at`) should come from the simulation
 *    clock; feature 1 has no clock service yet, so the server clock stands in.
 */

export const SEAT_ROLES = ['captain', 'first_officer', 'cabin_crew', 'police'] as const
export type SeatRole = (typeof SEAT_ROLES)[number]

/** `rule_break.rule`, as the migration's CHECK lists it. */
export const RULE_CODES = [
  'OVERLAP',
  'REST_SHORT',
  'HOURS_28D',
  'DUTY_LIMIT',
  'NO_LEGAL_CREW',
  'LICENCE_EXPIRED',
  'NO_TYPE_RATING',
  'WRONG_FLEET',
  'NO_LOCAL_CREW',
  'POLICE_MIN',
  'POLICE_NO_SEAT',
] as const
export type RuleCode = (typeof RULE_CODES)[number]

/** `law` breaks must be fixed with a swap; `company` breaks may be overridden in writing. */
export type RuleSeverity = 'law' | 'company'

const COMPANY_RULES: ReadonlySet<RuleCode> = new Set(['NO_LOCAL_CREW', 'POLICE_MIN', 'POLICE_NO_SEAT'])

const RULE_TITLES: Record<RuleCode, string> = {
  OVERLAP: 'Crew on two flights at once',
  REST_SHORT: 'Rest between duties',
  HOURS_28D: 'Flight hours in 28 days',
  DUTY_LIMIT: 'Duty limit',
  NO_LEGAL_CREW: 'Seat not filled',
  LICENCE_EXPIRED: 'Licence expired',
  NO_TYPE_RATING: 'No type rating',
  WRONG_FLEET: 'Wrong fleet',
  NO_LOCAL_CREW: 'No local crew',
  POLICE_MIN: 'Police complement',
  POLICE_NO_SEAT: 'No seat for police',
}

/**
 * Cabin crew per leg. The migration derives it from the aircraft layout
 * (`ceil(seats / seats_per_cabin_crew)`), but feature 9 has not documented the layout
 * JSON yet, so a fixed complement stands in.
 * TODO(f9): read the seat count from `aircraft_type.layout` once its shape is agreed.
 */
const CABIN_CREW_PER_LEG = 4

export interface AssignCrewParams {
  /** `YYYY-MM-DD`. */
  dateFrom: string
  /** `YYYY-MM-DD`, inclusive. */
  dateTo: string
  /** IATA base. */
  base: string
}

export interface RosterRunRow {
  id: string
  base: string
  dateFrom: string
  dateTo: string
  status: 'draft' | 'published'
}

/** The limits the rules use, as `crew_setting` holds them, before any stricter country rule. */
export interface RuleLimitsRow {
  minRestHours: number
  maxDutyHours: number
  maxFlightsPerDuty: number
  maxFlightHours28d: number
  minLocalCrew: number
  minPoliceInternational: number
  cabinCrewPerLeg: number
  reportMinutes: number
  releaseMinutes: number
}

export interface CommittedLegRow {
  /** `pairing_leg.id`. */
  legId: string
  flightId: string
  flightNumber: string
  origin: string
  destination: string
  departureAt: string
  arrivalAt: string
  /** Feature 9's `aircraft_type.model`, which ratings and fleets are held against. */
  aircraftType: string
  /** Origin and destination are in different countries. */
  international: boolean
  /** Languages that count as local at the destination; empty for a domestic leg. */
  localLanguages: string[]
}

export interface CommittedPairingRow {
  id: string
  code: string
  legs: CommittedLegRow[]
}

export interface CommittedPairingResult {
  rosterRun: RosterRunRow | null
  pairings: CommittedPairingRow[]
  /** Pairings in the window Build pairings has not committed (invalid, or not committed yet). */
  uncommitted: { id: string; code: string }[]
  totalLegs: number
  limits: RuleLimitsRow
}

export interface CrewSummaryRow {
  id: string
  /** `S. Kittipong`. */
  name: string
  fullName: string
  role: SeatRole
  languages: string[]
}

export interface LegAssignmentRow {
  pairingId: string
  pairingCode: string
  leg: CommittedLegRow
  captain: CrewSummaryRow | null
  firstOfficer: CrewSummaryRow | null
  cabinCrew: CrewSummaryRow[]
  /** The cabin crew who speak a local language at the destination. */
  localCrew: CrewSummaryRow[]
  police: CrewSummaryRow[]
  cabinRequired: number
  policeRequired: number
}

export interface RuleBreakRow {
  id: string
  code: RuleCode
  severity: RuleSeverity
  title: string
  detail: string
  pairingId: string
  legId: string
  flightNumber: string
  /** The person the break is about, for person rules. */
  crewId: string | null
  /** The empty seat, for `NO_LEGAL_CREW` only. */
  role: SeatRole | null
}

export interface AssignmentSummaryRow {
  totalLegs: number
  /** Legs with every seat filled. A leg can be fully crewed and still break a rule. */
  fullyCrewedLegs: number
  brokenLegs: number
  breakCount: number
}

export interface RunResult {
  rosterRun: RosterRunRow
  assignments: LegAssignmentRow[]
  /** Open breaks only; fixed and overridden ones are Fix & publish's history. */
  breaks: RuleBreakRow[]
  summary: AssignmentSummaryRow
}

const LEG_SELECT = {
  id: true,
  flight: {
    select: {
      id: true,
      flight_number: true,
      service_date: true,
      dep_at: true,
      arr_at: true,
      route: { select: { origin: true, destination: true } },
      aircraft: { select: { aircraft_type: { select: { model: true } } } },
    },
  },
} satisfies Prisma.pairing_legSelect

const RUN_SELECT = {
  id: true,
  base_airport: true,
  date_from: true,
  date_to: true,
  status: true,
  roster_run_pairing: {
    select: { pairing: { select: { id: true, code: true, pairing_leg: { select: LEG_SELECT } } } },
    orderBy: { pairing: { created_at: 'asc' } },
  },
} satisfies Prisma.roster_runSelect

const CREW_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  role: true,
  languages: true,
  fleet_aircraft_type: true,
  licence_expires_on: true,
  crew_certification: { select: { aircraft_type: true, expires_on: true } },
} satisfies Prisma.crewSelect

const ASSIGNMENT_SELECT = {
  id: true,
  crew_id: true,
  pairing_id: true,
  pairing_leg_id: true,
  role: true,
  assigned_by: true,
  pairing_leg: { select: { flight: { select: { dep_at: true, arr_at: true } } } },
} satisfies Prisma.pairing_leg_assignmentSelect

export type RunDbRow = Prisma.roster_runGetPayload<{ select: typeof RUN_SELECT }>
type CrewDbRow = Prisma.crewGetPayload<{ select: typeof CREW_SELECT }>
type AssignmentDbRow = Prisma.pairing_leg_assignmentGetPayload<{ select: typeof ASSIGNMENT_SELECT }>

export interface Leg {
  id: string
  pairingId: string
  pairingCode: string
  flightId: string
  flightNumber: string
  /** `YYYY-MM-DD`. */
  serviceDate: string
  dep: Date
  arr: Date
  origin: string
  destination: string
  destinationCountry: string
  aircraftType: string
  international: boolean
  localLanguages: string[]
}

export interface RunPairing {
  id: string
  code: string
  legs: Leg[]
  /** The defaults, tightened by the countries the pairing visits. */
  limits: RuleLimitsRow
}

export interface Context {
  defaults: RuleLimitsRow
  countryRules: Map<string, { minRestHours: number; maxDutyHours: number }>
  airportCountry: Map<string, string>
  countryLanguages: Map<string, string[]>
  /** Duty days are cut at local midnight in the base's timezone. */
  timeZone: string
}

/** One leg a person flies, from any run. */
interface BusyLeg {
  legId: string
  pairingId: string
  dep: Date
  arr: Date
}

interface FoundBreak {
  pairingId: string
  legId: string
  crewId: string | null
  role: SeatRole | null
  rule: RuleCode
  detail: string
}

const HOUR = 3_600_000
const DAY = 86_400_000

@Injectable()
export class AssignCrewService {
  constructor(private readonly db: DbService) {}

  /** Bases a run can be crewed from — the same set Build pairings offers. */
  async listBases(): Promise<string[]> {
    const rows = await this.db.airport.findMany({ where: { is_active: true }, select: { iata_code: true }, orderBy: { iata_code: 'asc' } })
    return rows.map((row) => row.iata_code)
  }

  /** The run Build pairings committed for exactly this base and window, and what it left out. */
  async listCommittedPairings(params: AssignCrewParams): Promise<CommittedPairingResult> {
    const context = await this.loadContext(params.base)
    const window = { gte: new Date(`${params.dateFrom}T00:00:00.000Z`), lte: new Date(`${params.dateTo}T00:00:00.000Z`) }

    const [run, uncommitted] = await Promise.all([
      this.db.roster_run.findFirst({
        where: { base_airport: params.base, date_from: window.gte, date_to: window.lte },
        select: RUN_SELECT,
        orderBy: { created_at: 'desc' },
      }),
      this.db.pairing.findMany({
        where: { base_airport: params.base, roster_run_pairing: { is: null }, pairing_leg: { some: { flight: { service_date: window } } } },
        select: { id: true, code: true },
        orderBy: { created_at: 'asc' },
      }),
    ])

    const pairings = run ? this.toRunPairings(run, context) : []
    return {
      rosterRun: run ? this.toRunRow(run) : null,
      pairings: pairings.map((pairing) => ({ id: pairing.id, code: pairing.code, legs: pairing.legs.map((leg) => this.toLegRow(leg)) })),
      uncommitted,
      totalLegs: pairings.reduce((total, pairing) => total + pairing.legs.length, 0),
      limits: context.defaults,
    }
  }

  /** What is stored for the run now, without re-checking. */
  async getRun(rosterRunId: string): Promise<RunResult> {
    const { run, pairings } = await this.loadRun(rosterRunId)
    const assignments = await this.activeAssignments(pairings)
    return this.toResult(run, pairings, assignments, await this.openBreaks(rosterRunId))
  }

  /**
   * Crews the chosen pairings of a draft run, then re-checks the run.
   *
   * The pairings' previous automatic rows are deleted first (a draft run's rows may be),
   * so a re-run is a re-crew rather than a second set of seats. Rows Ops added by hand
   * (`assigned_by = 'ops'`) stay, and the seats they fill are not filled again.
   */
  async autoAssign(rosterRunId: string, pairingIds: string[]): Promise<RunResult> {
    const { run, pairings } = await this.loadRun(rosterRunId)
    if (run.status === 'published') throw new ConflictException('This roster is published and can no longer be crewed automatically')

    const unknown = pairingIds.find((id) => !pairings.some((pairing) => pairing.id === id))
    if (unknown) throw new BadRequestException(`Pairing ${unknown} is not in this roster run`)
    const targets = pairingIds.length > 0 ? pairings.filter((pairing) => pairingIds.includes(pairing.id)) : pairings
    if (targets.every((pairing) => pairing.legs.length === 0)) throw new BadRequestException('The run has no legs to crew')
    const targetIds = new Set(targets.map((pairing) => pairing.id))

    const pool = await this.db.crew.findMany({
      where: { deleted_at: null, base_airport: run.base_airport },
      select: CREW_SELECT,
      orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
    })
    const legs = targets.flatMap((pairing) => pairing.legs)
    const readAt = new Date()
    const existing = await this.db.pairing_leg_assignment.findMany({
      where: {
        crew_id: { in: pool.map((member) => member.id) },
        unassigned_at: null,
        pairing_leg: { flight: { dep_at: this.historyWindow(legs) } },
      },
      select: ASSIGNMENT_SELECT,
    })
    // The targets' automatic rows are about to be replaced, so they do not make anyone busy.
    const kept = existing.filter((row) => !(row.assigned_by === 'auto' && targetIds.has(row.pairing_id)))
    const busy = this.busyByCrew(kept)

    const rows: Prisma.pairing_leg_assignmentCreateManyInput[] = []
    for (const pairing of targets) {
      const plan = this.planPairing(pairing, pool, busy)
      for (const leg of pairing.legs) {
        const byOps = kept.filter((row) => row.pairing_leg_id === leg.id)
        const onLeg = new Set(byOps.map((row) => row.crew_id))
        for (const role of SEAT_ROLES) {
          const open = this.required(role, leg, pairing.limits) - byOps.filter((row) => row.role === role).length
          for (const member of plan[role].filter((candidate) => !onLeg.has(candidate.id)).slice(0, Math.max(0, open))) {
            rows.push({
              pairing_id: pairing.id,
              pairing_leg_id: leg.id,
              crew_id: member.id,
              role,
              assigned_by: 'auto',
              assigned_at: new Date(),
            })
          }
        }
      }
    }

    await this.db.$transaction(async (tx) => {
      const crewIds = [...new Set(rows.map((row) => row.crew_id))]
      if (crewIds.length > 0) {
        // Holding the crew rows means nobody else can assign these people until this commits. Anything
        // assigned to them between the read above and the lock was not part of the plan, so stop.
        await tx.$queryRaw`SELECT id FROM crew WHERE id = ANY(${crewIds}::uuid[]) FOR UPDATE`
        const raced = await tx.pairing_leg_assignment.count({
          where: { crew_id: { in: crewIds }, unassigned_at: null, created_at: { gt: readAt }, pairing_id: { notIn: [...targetIds] } },
        })
        if (raced > 0) throw new ConflictException('Some of this crew were assigned elsewhere while auto-assign ran. Run it again.')
      }
      await tx.pairing_leg_assignment.deleteMany({ where: { pairing_id: { in: [...targetIds] }, assigned_by: 'auto' } })
      if (rows.length > 0) await tx.pairing_leg_assignment.createMany({ data: rows })
    })

    return this.check(rosterRunId)
  }

  /** Re-checks every rule on the run against what is stored, and records the result. */
  async check(rosterRunId: string): Promise<RunResult> {
    const { run, pairings, context } = await this.loadRun(rosterRunId)
    const assignments = await this.activeAssignments(pairings)
    const crewIds = [...new Set(assignments.map((row) => row.crew_id))]
    const legs = pairings.flatMap((pairing) => pairing.legs)
    const history =
      crewIds.length === 0
        ? []
        : await this.db.pairing_leg_assignment.findMany({
            where: { crew_id: { in: crewIds }, unassigned_at: null, pairing_leg: { flight: { dep_at: this.historyWindow(legs) } } },
            select: ASSIGNMENT_SELECT,
          })

    const found = this.evaluate(pairings, assignments, this.busyByCrew(history), context)
    await this.storeBreaks(rosterRunId, found)
    return this.toResult(run, pairings, assignments, await this.openBreaks(rosterRunId))
  }

  /* ── assignment ─────────────────────────────────────────────────────────── */

  /**
   * Picks the people for one pairing, seat by seat.
   *
   * A candidate must hold the seat's role, a licence valid through the last flight date,
   * the fleet of every leg (police travel as passengers and are exempt), a current type
   * rating if a pilot, enough rest either side of the pairing and room under the 28-day
   * cap. Among those, a person is picked at random; now and then (`BREAK_RATE`) the pick is
   * someone who is qualified but not rested, so a run has rule breaks for Ops to fix. With nobody
   * legal a seat stays empty. The chosen people are then marked busy, which the next pairing's
   * legal picks respect.
   */
  private planPairing(pairing: RunPairing, pool: CrewDbRow[], busy: Map<string, BusyLeg[]>): Record<SeatRole, CrewDbRow[]> {
    const { limits } = pairing
    const first = pairing.legs[0]
    const last = pairing.legs[pairing.legs.length - 1]
    const start = first.dep.getTime() - limits.reportMinutes * 60_000
    const end = last.arr.getTime() + limits.releaseMinutes * 60_000
    const lastDate = pairing.legs.reduce((latest, leg) => (leg.serviceDate > latest ? leg.serviceDate : latest), first.serviceDate)
    const models = [...new Set(pairing.legs.map((leg) => leg.aircraftType))]
    const block = pairing.legs.reduce((total, leg) => total + (leg.arr.getTime() - leg.dep.getTime()), 0)
    const chosen = new Set<string>()

    const eligible = (member: CrewDbRow, seat: SeatRole, strict = true): boolean => {
      if (member.role !== seat || chosen.has(member.id)) return false
      if (isoDate(member.licence_expires_on) < lastDate) return false
      if (seat !== 'police' && models.some((model) => member.fleet_aircraft_type !== model)) return false
      if (isPilot(seat) && models.some((model) => !this.rated(member, model, lastDate))) return false
      // Not strict means everything but rest and hours: the dice may pick such a person, and the check then reports the break.
      if (!strict) return true

      const theirs = busy.get(member.id) ?? []
      const rest = limits.minRestHours * HOUR
      const rested = theirs.every((other) => {
        const otherStart = other.dep.getTime() - limits.reportMinutes * 60_000
        const otherEnd = other.arr.getTime() + limits.releaseMinutes * 60_000
        return otherEnd + rest <= start || end + rest <= otherStart
      })
      if (!rested) return false

      const flown = theirs
        .filter((other) => other.dep.getTime() > end - 28 * DAY && other.dep.getTime() <= end)
        .reduce((total, other) => total + (other.arr.getTime() - other.dep.getTime()), 0)
      return flown + block <= limits.maxFlightHours28d * HOUR
    }

    const pick = (seat: SeatRole, count: number, prefer: (member: CrewDbRow) => boolean = () => true): CrewDbRow[] => {
      const picked: CrewDbRow[] = []
      for (let taken = 0; taken < Math.max(0, count); taken += 1) {
        const legal = pool.filter((member) => eligible(member, seat) && prefer(member))
        const loose = pool.filter((member) => eligible(member, seat, false) && prefer(member))
        const member = pickOne(legal, loose, Math.random)
        if (!member) break
        chosen.add(member.id)
        picked.push(member)
      }
      return picked
    }

    const captain = pick('captain', 1)
    const firstOfficer = pick('first_officer', 1)

    // Local speakers first, one language set at a time, then the rest of the cabin.
    const cabin: CrewDbRow[] = []
    const languageSets = new Map(
      pairing.legs
        .filter((leg) => leg.international && leg.localLanguages.length > 0)
        .map((leg) => [leg.localLanguages.join(','), leg.localLanguages]),
    )
    for (const languages of languageSets.values()) {
      const have = cabin.filter((member) => speaks(member.languages, languages)).length
      const room = CABIN_CREW_PER_LEG - cabin.length
      // Now and then the speaker is left to chance, which is what raises NO_LOCAL_CREW.
      const wanted = Math.random() < LOCAL_MISS_RATE ? 0 : Math.min(room, limits.minLocalCrew - have)
      cabin.push(...pick('cabin_crew', wanted, (member) => speaks(member.languages, languages)))
    }
    cabin.push(...pick('cabin_crew', CABIN_CREW_PER_LEG - cabin.length))

    const international = pairing.legs.some((leg) => leg.international)
    const policeWanted = Math.random() < POLICE_SHORT_RATE ? Math.max(0, limits.minPoliceInternational - 1) : limits.minPoliceInternational
    const police = international ? pick('police', policeWanted) : []

    const plan: Record<SeatRole, CrewDbRow[]> = { captain, first_officer: firstOfficer, cabin_crew: cabin, police }
    for (const member of Object.values(plan).flat()) {
      const theirs = busy.get(member.id) ?? []
      theirs.push(...pairing.legs.map((leg) => ({ legId: leg.id, pairingId: pairing.id, dep: leg.dep, arr: leg.arr })))
      busy.set(member.id, theirs)
    }
    return plan
  }

  private required(role: SeatRole, leg: Leg, limits: RuleLimitsRow): number {
    if (role === 'cabin_crew') return CABIN_CREW_PER_LEG
    if (role === 'police') return leg.international ? limits.minPoliceInternational : 0
    return 1
  }

  /** A current certification for this aircraft model on the flight date. */
  private rated(member: CrewDbRow, model: string, onDate: string): boolean {
    return member.crew_certification.some((cert) => cert.aircraft_type === model && isoDate(cert.expires_on) >= onDate)
  }

  /* ── rules ──────────────────────────────────────────────────────────────── */

  /**
   * Every rule the stored roster fails. Person rules name the person and leave `role`
   * empty; only `NO_LEGAL_CREW` names a seat, as the table's CHECK requires.
   */
  private evaluate(
    pairings: RunPairing[],
    assignments: (AssignmentDbRow & { crew: CrewDbRow })[],
    busy: Map<string, BusyLeg[]>,
    context: Context,
  ): FoundBreak[] {
    const found = new Map<string, FoundBreak>()
    const raise = (item: FoundBreak): void => {
      const key = breakKey(item.legId, item.rule, item.crewId, item.role)
      if (!found.has(key)) found.set(key, item)
    }
    const pairingOfLeg = new Map(pairings.flatMap((pairing) => pairing.legs.map((leg) => [leg.id, pairing] as const)))

    for (const pairing of pairings) {
      const { limits } = pairing

      for (const day of this.dutyDays(pairing.legs, context.timeZone)) {
        const minutes = this.dutyMinutes(day, limits)
        if (day.length > limits.maxFlightsPerDuty || minutes > limits.maxDutyHours * 60) {
          raise({
            pairingId: pairing.id,
            legId: day[0].id,
            crewId: null,
            role: null,
            rule: 'DUTY_LIMIT',
            detail:
              day.length > limits.maxFlightsPerDuty
                ? `The duty starting with ${day[0].flightNumber} has ${day.length} flights; the limit is ${limits.maxFlightsPerDuty}.`
                : `The duty starting with ${day[0].flightNumber} runs ${hours(minutes / 60)}; the limit is ${hours(limits.maxDutyHours)}.`,
          })
        }
      }

      for (const leg of pairing.legs) {
        const onLeg = assignments.filter((row) => row.pairing_leg_id === leg.id)
        const seat = (role: SeatRole) => onLeg.filter((row) => row.role === role)
        const base = { pairingId: pairing.id, legId: leg.id }

        if (seat('captain').length === 0)
          raise({ ...base, crewId: null, role: 'captain', rule: 'NO_LEGAL_CREW', detail: `${leg.flightNumber} has no legal captain.` })
        if (seat('first_officer').length === 0)
          raise({
            ...base,
            crewId: null,
            role: 'first_officer',
            rule: 'NO_LEGAL_CREW',
            detail: `${leg.flightNumber} has no legal first officer.`,
          })
        const cabin = seat('cabin_crew')
        if (cabin.length < CABIN_CREW_PER_LEG) {
          raise({
            ...base,
            crewId: null,
            role: 'cabin_crew',
            rule: 'NO_LEGAL_CREW',
            detail: `${cabin.length} of ${CABIN_CREW_PER_LEG} cabin crew on ${leg.flightNumber}.`,
          })
        }

        if (leg.international) {
          const police = seat('police').length
          if (police < limits.minPoliceInternational) {
            raise({
              ...base,
              crewId: null,
              role: null,
              rule: 'POLICE_MIN',
              detail: `${police} of ${limits.minPoliceInternational} police on international flight ${leg.flightNumber}.`,
            })
          }
          if (limits.minLocalCrew > 0) {
            const speakers = cabin.filter((row) => speaks(row.crew.languages, leg.localLanguages)).length
            if (leg.localLanguages.length === 0) {
              raise({
                ...base,
                crewId: null,
                role: null,
                rule: 'NO_LOCAL_CREW',
                detail: `No local languages are set for ${leg.destinationCountry.toUpperCase()} (${leg.destination}). Add them in Setup rules.`,
              })
            } else if (speakers < limits.minLocalCrew) {
              raise({
                ...base,
                crewId: null,
                role: null,
                rule: 'NO_LOCAL_CREW',
                detail: `${speakers} of ${limits.minLocalCrew} cabin crew on ${leg.flightNumber} speak ${leg.localLanguages.join(' or ')} for ${leg.destination}.`,
              })
            }
          }
        }

        for (const row of onLeg) {
          const member = row.crew
          const name = shortName(member)
          const person = { ...base, crewId: member.id, role: null }
          if (isoDate(member.licence_expires_on) < leg.serviceDate) {
            raise({ ...person, rule: 'LICENCE_EXPIRED', detail: `${name}'s licence expired on ${isoDate(member.licence_expires_on)}.` })
          }
          if (row.role !== 'police' && member.fleet_aircraft_type !== leg.aircraftType) {
            raise({
              ...person,
              rule: 'WRONG_FLEET',
              detail: `${name} flies the ${member.fleet_aircraft_type}, but ${leg.flightNumber} is a ${leg.aircraftType}.`,
            })
          }
          if (isPilot(row.role) && !this.rated(member, leg.aircraftType, leg.serviceDate)) {
            raise({
              ...person,
              rule: 'NO_TYPE_RATING',
              detail: `${name} has no valid ${leg.aircraftType} type rating on ${leg.serviceDate}.`,
            })
          }

          const theirs = busy.get(member.id) ?? []
          const clash = theirs.find((other) => other.legId !== leg.id && other.dep < leg.arr && leg.dep < other.arr)
          if (clash) raise({ ...person, rule: 'OVERLAP', detail: `${name} is on another flight during ${leg.flightNumber}.` })

          const flown = theirs
            .filter((other) => other.dep.getTime() > leg.dep.getTime() - 28 * DAY && other.dep <= leg.dep)
            .reduce((total, other) => total + (other.arr.getTime() - other.dep.getTime()), 0)
          if (flown > limits.maxFlightHours28d * HOUR) {
            raise({
              ...person,
              rule: 'HOURS_28D',
              detail: `${name} reaches ${hours(flown / HOUR)} in the 28 days to ${leg.flightNumber}; the cap is ${hours(limits.maxFlightHours28d)}.`,
            })
          }
        }
      }
    }

    // Rest is a property of a person's duties, not of one leg: each duty after the first must
    // start at least the minimum rest after the one before it ends.
    const crewById = new Map(assignments.map((row) => [row.crew_id, row.crew]))
    for (const [crewId, member] of crewById) {
      const duties = this.personDuties(busy.get(crewId) ?? [], context)
      for (let index = 1; index < duties.length; index += 1) {
        const pairing = pairingOfLeg.get(duties[index].firstLegId)
        if (!pairing) continue
        const rest = (duties[index].start - duties[index - 1].end) / HOUR
        if (rest < pairing.limits.minRestHours) {
          const leg = pairing.legs.find((candidate) => candidate.id === duties[index].firstLegId)
          raise({
            pairingId: pairing.id,
            legId: duties[index].firstLegId,
            crewId,
            role: null,
            rule: 'REST_SHORT',
            detail: `${shortName(member)} has ${hours(rest)} rest before ${leg?.flightNumber ?? 'this duty'}; the minimum is ${hours(pairing.limits.minRestHours)}.`,
          })
        }
      }
    }

    return [...found.values()]
  }

  /**
   * Records a check: inserts what is new, closes the open breaks no longer found as
   * `fixed`, refreshes the wording of the ones still open, and leaves overridden ones closed.
   */
  private async storeBreaks(rosterRunId: string, found: FoundBreak[]): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const stored = await tx.rule_break.findMany({
        where: { roster_run_id: rosterRunId, OR: [{ resolved_at: null }, { resolution: 'overridden' }] },
        select: { id: true, pairing_leg_id: true, rule: true, crew_id: true, role: true, detail: true, resolved_at: true },
      })
      const open = new Map(
        stored.filter((row) => row.resolved_at === null).map((row) => [breakKey(row.pairing_leg_id, row.rule, row.crew_id, row.role), row]),
      )
      const overridden = new Set(
        stored.filter((row) => row.resolved_at !== null).map((row) => breakKey(row.pairing_leg_id, row.rule, row.crew_id, row.role)),
      )
      const foundKeys = new Set(found.map((item) => breakKey(item.legId, item.rule, item.crewId, item.role)))

      const fixed = [...open.entries()].filter(([key]) => !foundKeys.has(key)).map(([, row]) => row.id)
      if (fixed.length > 0) {
        await tx.rule_break.updateMany({ where: { id: { in: fixed } }, data: { resolved_at: new Date(), resolution: 'fixed' } })
      }

      const fresh: Prisma.rule_breakCreateManyInput[] = []
      for (const item of found) {
        const key = breakKey(item.legId, item.rule, item.crewId, item.role)
        const current = open.get(key)
        if (current && current.detail !== item.detail)
          await tx.rule_break.update({ where: { id: current.id }, data: { detail: item.detail } })
        if (!current && !overridden.has(key)) {
          fresh.push({
            roster_run_id: rosterRunId,
            pairing_id: item.pairingId,
            pairing_leg_id: item.legId,
            crew_id: item.crewId,
            role: item.role,
            rule: item.rule,
            detail: item.detail,
          })
        }
      }
      if (fresh.length > 0) await tx.rule_break.createMany({ data: fresh, skipDuplicates: true })
    })
  }

  /** Consecutive legs of one pairing that depart on the same local day form one duty. */
  private dutyDays(legs: Leg[], timeZone: string): Leg[][] {
    const days: Leg[][] = []
    for (const leg of legs) {
      const current = days[days.length - 1]
      if (current && localDay(current[0].dep, timeZone) === localDay(leg.dep, timeZone)) current.push(leg)
      else days.push([leg])
    }
    return days
  }

  private dutyMinutes(day: Leg[], limits: RuleLimitsRow): number {
    const start = day[0].dep.getTime() - limits.reportMinutes * 60_000
    const end = day[day.length - 1].arr.getTime() + limits.releaseMinutes * 60_000
    return Math.max(0, Math.round((end - start) / 60_000))
  }

  /** A person's duties across every run: their legs grouped by pairing and local day, in time order. */
  private personDuties(legs: BusyLeg[], context: Context): { firstLegId: string; start: number; end: number }[] {
    const groups = new Map<string, BusyLeg[]>()
    for (const leg of [...legs].sort((a, b) => a.dep.getTime() - b.dep.getTime())) {
      const key = `${leg.pairingId}|${localDay(leg.dep, context.timeZone)}`
      groups.set(key, [...(groups.get(key) ?? []), leg])
    }
    const { reportMinutes, releaseMinutes } = context.defaults
    return [...groups.values()]
      .map((group) => ({
        firstLegId: group[0].legId,
        start: group[0].dep.getTime() - reportMinutes * 60_000,
        end: group[group.length - 1].arr.getTime() + releaseMinutes * 60_000,
      }))
      .sort((a, b) => a.start - b.start)
  }

  /* ── reads ──────────────────────────────────────────────────────────────── */

  /** The run with its pairings and legs, for the step that fixes and publishes it. */
  async loadRun(rosterRunId: string): Promise<{ run: RunDbRow; pairings: RunPairing[]; context: Context }> {
    const run = await this.db.roster_run.findUnique({ where: { id: rosterRunId }, select: RUN_SELECT })
    if (!run) throw new NotFoundException(`Roster run ${rosterRunId} was not found`)
    const context = await this.loadContext(run.base_airport)
    return { run, pairings: this.toRunPairings(run, context), context }
  }

  private async activeAssignments(pairings: RunPairing[]): Promise<(AssignmentDbRow & { crew: CrewDbRow })[]> {
    if (pairings.length === 0) return []
    return this.db.pairing_leg_assignment.findMany({
      where: { pairing_id: { in: pairings.map((pairing) => pairing.id) }, unassigned_at: null },
      select: { ...ASSIGNMENT_SELECT, crew: { select: CREW_SELECT } },
      orderBy: { created_at: 'asc' },
    })
  }

  private async openBreaks(rosterRunId: string): Promise<RuleBreakRow[]> {
    const rows = await this.db.rule_break.findMany({
      where: { roster_run_id: rosterRunId, resolved_at: null },
      select: {
        id: true,
        pairing_id: true,
        pairing_leg_id: true,
        crew_id: true,
        role: true,
        rule: true,
        detail: true,
        pairing_leg: { select: { flight: { select: { flight_number: true, dep_at: true } } } },
      },
    })
    return rows
      .sort((a, b) => a.pairing_leg.flight.dep_at.getTime() - b.pairing_leg.flight.dep_at.getTime() || a.rule.localeCompare(b.rule))
      .map((row) => {
        const code = row.rule as RuleCode
        return {
          id: row.id,
          code,
          severity: COMPANY_RULES.has(code) ? 'company' : 'law',
          title: `${RULE_TITLES[code] ?? row.rule} · ${row.pairing_leg.flight.flight_number}`,
          detail: row.detail,
          pairingId: row.pairing_id,
          legId: row.pairing_leg_id,
          flightNumber: row.pairing_leg.flight.flight_number,
          crewId: row.crew_id,
          role: (row.role as SeatRole | null) ?? null,
        }
      })
  }

  private async loadContext(base: string): Promise<Context> {
    const [settings, countryRules, airports, languages] = await Promise.all([
      this.db.crew_setting.findMany({ select: { key: true, value: true } }),
      this.db.country_legality_rule.findMany({ select: { country_code: true, min_rest_hours: true, max_duty_hours: true } }),
      this.db.airport.findMany({ select: { iata_code: true, country: true, timezone: true } }),
      this.db.country_language.findMany({ select: { country_code: true, language_code: true }, orderBy: { language_code: 'asc' } }),
    ])

    const baseAirport = airports.find((airport) => airport.iata_code === base)
    if (!baseAirport) throw new NotFoundException(`Base ${base} was not found`)

    const setting = new Map(settings.map((row) => [row.key, Number.parseFloat(row.value)]))
    const read = (key: string, fallback: number): number => {
      const value = setting.get(key)
      return value !== undefined && Number.isFinite(value) ? value : fallback
    }

    const countryLanguages = new Map<string, string[]>()
    for (const row of languages)
      countryLanguages.set(row.country_code, [...(countryLanguages.get(row.country_code) ?? []), row.language_code])

    return {
      defaults: {
        minRestHours: read('min_rest_hours', 10),
        maxDutyHours: read('max_duty_hours', 13),
        maxFlightsPerDuty: read('max_flights_per_duty', 4),
        maxFlightHours28d: read('max_flight_hours_28d', 100),
        minLocalCrew: read('min_local_crew', 1),
        minPoliceInternational: read('min_police_international', 2),
        cabinCrewPerLeg: CABIN_CREW_PER_LEG,
        reportMinutes: read('report_minutes', 60),
        releaseMinutes: read('release_minutes', 0),
      },
      countryRules: new Map(
        countryRules.map((rule) => [
          rule.country_code,
          { minRestHours: Number(rule.min_rest_hours), maxDutyHours: Number(rule.max_duty_hours) },
        ]),
      ),
      airportCountry: new Map(airports.map((airport) => [airport.iata_code, airport.country.toLowerCase()])),
      countryLanguages,
      timeZone: baseAirport.timezone,
    }
  }

  /* ── mapping ────────────────────────────────────────────────────────────── */

  private toRunPairings(run: RunDbRow, context: Context): RunPairing[] {
    return run.roster_run_pairing.map(({ pairing }) => {
      const legs = pairing.pairing_leg
        .map((row): Leg => {
          const { flight } = row
          const originCountry = context.airportCountry.get(flight.route.origin) ?? ''
          const destinationCountry = context.airportCountry.get(flight.route.destination) ?? ''
          const international = originCountry !== destinationCountry
          return {
            id: row.id,
            pairingId: pairing.id,
            pairingCode: pairing.code,
            flightId: flight.id,
            flightNumber: flight.flight_number,
            serviceDate: isoDate(flight.service_date),
            dep: flight.dep_at,
            arr: flight.arr_at,
            origin: flight.route.origin,
            destination: flight.route.destination,
            destinationCountry,
            aircraftType: flight.aircraft.aircraft_type.model,
            international,
            localLanguages: international ? (context.countryLanguages.get(destinationCountry) ?? []) : [],
          }
        })
        .sort((a, b) => a.dep.getTime() - b.dep.getTime())

      const limits = { ...context.defaults }
      for (const leg of legs) {
        const rule = context.countryRules.get(leg.destinationCountry)
        if (!rule) continue
        limits.minRestHours = Math.max(limits.minRestHours, rule.minRestHours)
        limits.maxDutyHours = Math.min(limits.maxDutyHours, rule.maxDutyHours)
      }
      return { id: pairing.id, code: pairing.code, legs, limits }
    })
  }

  private toResult(
    run: RunDbRow,
    pairings: RunPairing[],
    assignments: (AssignmentDbRow & { crew: CrewDbRow })[],
    breaks: RuleBreakRow[],
  ): RunResult {
    const rows: LegAssignmentRow[] = pairings.flatMap((pairing) =>
      pairing.legs.map((leg) => {
        const onLeg = assignments.filter((row) => row.pairing_leg_id === leg.id)
        const seat = (role: SeatRole) => onLeg.filter((row) => row.role === role).map((row) => toCrewSummary(row.crew))
        const cabinCrew = seat('cabin_crew')
        return {
          pairingId: pairing.id,
          pairingCode: pairing.code,
          leg: this.toLegRow(leg),
          captain: seat('captain')[0] ?? null,
          firstOfficer: seat('first_officer')[0] ?? null,
          cabinCrew,
          localCrew: leg.international ? cabinCrew.filter((member) => speaks(member.languages, leg.localLanguages)) : [],
          police: seat('police'),
          cabinRequired: CABIN_CREW_PER_LEG,
          policeRequired: this.required('police', leg, pairing.limits),
        }
      }),
    )

    const brokenLegs = new Set(breaks.map((item) => item.legId))
    return {
      rosterRun: this.toRunRow(run),
      assignments: rows,
      breaks,
      summary: {
        totalLegs: rows.length,
        fullyCrewedLegs: rows.filter(
          (row) =>
            row.captain !== null &&
            row.firstOfficer !== null &&
            row.cabinCrew.length >= row.cabinRequired &&
            row.police.length >= row.policeRequired,
        ).length,
        brokenLegs: brokenLegs.size,
        breakCount: breaks.length,
      },
    }
  }

  private toRunRow(run: RunDbRow): RosterRunRow {
    return {
      id: run.id,
      base: run.base_airport,
      dateFrom: isoDate(run.date_from),
      dateTo: isoDate(run.date_to),
      status: run.status === 'published' ? 'published' : 'draft',
    }
  }

  private toLegRow(leg: Leg): CommittedLegRow {
    return {
      legId: leg.id,
      flightId: leg.flightId,
      flightNumber: leg.flightNumber,
      origin: leg.origin,
      destination: leg.destination,
      departureAt: leg.dep.toISOString(),
      arrivalAt: leg.arr.toISOString(),
      aircraftType: leg.aircraftType,
      international: leg.international,
      localLanguages: leg.localLanguages,
    }
  }

  private busyByCrew(rows: AssignmentDbRow[]): Map<string, BusyLeg[]> {
    const out = new Map<string, BusyLeg[]>()
    for (const row of rows) {
      const entry = {
        legId: row.pairing_leg_id,
        pairingId: row.pairing_id,
        dep: row.pairing_leg.flight.dep_at,
        arr: row.pairing_leg.flight.arr_at,
      }
      out.set(row.crew_id, [...(out.get(row.crew_id) ?? []), entry])
    }
    return out
  }

  /** Far enough back for the 28-day cap and far enough ahead for rest after the last leg. */
  private historyWindow(legs: Leg[]): { gte: Date; lte: Date } {
    const deps = legs.map((leg) => leg.dep.getTime())
    if (deps.length === 0) return { gte: new Date(0), lte: new Date(0) }
    return { gte: new Date(Math.min(...deps) - 28 * DAY), lte: new Date(Math.max(...deps) + 3 * DAY) }
  }
}

function isPilot(role: string): boolean {
  return role === 'captain' || role === 'first_officer'
}

function speaks(spoken: readonly string[], wanted: readonly string[]): boolean {
  return wanted.some((language) => spoken.includes(language))
}

/** `rule_break_open_uq` treats NULLs as equal, so the key does too. */
function breakKey(legId: string, rule: string, crewId: string | null, role: string | null): string {
  return `${legId}|${rule}|${crewId ?? ''}|${role ?? ''}`
}

function shortName(member: { first_name: string; last_name: string }): string {
  return `${member.first_name.charAt(0)}. ${member.last_name}`
}

function toCrewSummary(member: CrewDbRow): CrewSummaryRow {
  return {
    id: member.id,
    name: shortName(member),
    fullName: `${member.first_name} ${member.last_name}`,
    role: member.role as SeatRole,
    languages: member.languages,
  }
}

/** `YYYY-MM-DD` of a `DATE` column, which Prisma returns at UTC midnight. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/** `YYYY-MM-DD` of an instant in the given timezone. */
function localDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

function hours(value: number): string {
  return `${Math.round(value * 10) / 10} h`
}
