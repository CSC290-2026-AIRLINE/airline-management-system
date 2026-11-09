import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { Prisma } from '@backend/db/generated/prisma/client'
import {
  AssignCrewService,
  type Context,
  type Leg,
  type LegAssignmentRow,
  type RosterRunRow,
  type RuleCode,
  type RuleLimitsRow,
  type RunPairing,
  type SeatRole,
} from '../assign-crew/assign-crew.service'
import { isoDate, shortName } from '../crew-format'

/**
 * Feature 8 · Step 4 — fix and publish.
 *
 * Closes the `rule_break` rows step 3 raised, by swapping crew in or by overriding a
 * company rule in writing, and publishes the `roster_run`. It never decides what is a
 * break: every edit rewrites `pairing_leg_assignment` and then asks
 * `AssignCrewService.check`, the one place the rules live, so a swap that opens a
 * second break shows up at once and a break only closes when its rule really passes.
 *
 * Decisions taken from the F8 migration (`20261024120000_feature8_crew_rostering`):
 *
 *  · **Law rules are never overridden.** Only `NO_LOCAL_CREW`, `POLICE_MIN` and
 *    `POLICE_NO_SEAT` can be closed in writing; the table's CHECK says so too.
 *  · **History is never deleted on a published run.** A swap or a sick call sets
 *    `unassigned_at` and `reason` on the old row and adds a new one.
 *  · **A sick call is a removal, not a rule.** There is no `SICK_CALL` rule; taking
 *    somebody off leaves a seat empty, which the check reports as `NO_LEGAL_CREW`
 *    (or `POLICE_MIN`), with the person who came off read back from the old row.
 *  · **Overrides and swaps go to `audit_log`.** Its `action` is a fixed list, so both
 *    are `update`, with the detail in `summary`, `reason` and `after`. `actor_id` is the
 *    caller's `user.id`; `rule_break.overridden_by` is their `staff.id`.
 *  · Business timestamps should come from the simulation clock; feature 1 has no clock
 *    service yet, so the server clock stands in.
 */

export type Severity = 'law' | 'company'

export interface RunInfoRow extends RosterRunRow {
  publishedAt: string | null
}

export interface CandidateCheckRow {
  label: string
  ok: boolean
  reason?: string
}

export interface ReplacementMemberRow {
  id: string
  /** `S. Kittipong`. */
  name: string
  fullName: string
  role: SeatRole
  languages: string[]
}

export interface ReplacementCandidateRow {
  member: ReplacementMemberRow
  checks: CandidateCheckRow[]
  /** False when any check failed; the candidate is still listed so the reason is visible. */
  allowed: boolean
}

export interface ReplacementSetRow {
  /** `2 legal police officers available`, or `0 legal captains available`. */
  availableLabel: string
  allowedCount: number
  instruction: string
  /** What to say when nobody can be added. */
  blockedNote?: string
  candidates: ReplacementCandidateRow[]
}

export interface RosterFactRow {
  label: string
  value: string
  danger?: boolean
}

export interface RemovedMemberRow {
  /** Who came off, so the cover picker never offers the same person back. */
  crewId: string
  name: string
  role: SeatRole
  reason: string
}

export interface ResolutionRow {
  kind: 'fixed' | 'overridden'
  /** The green line in the left list. */
  summary: string
  /** `captain swapped`, `police added`, `reason logged`. */
  short: string
  reason?: string
  /** The green sentence inside the panel. */
  banner: string
}

export interface FixBreakRow {
  /** `rule_break.id`. */
  id: string
  code: RuleCode
  /** Panel heading: the code, or `SICK CALL` for a seat somebody came off. */
  title: string
  severity: Severity
  /** Fixed by creation order and never reused, so closing break 1 does not renumber break 3. */
  position: number
  pairingId: string
  /** `P-101`. */
  pairingCode: string
  /** `pairing_leg.id`. */
  legId: string
  flightNumber: string
  context: string
  explanation: string
  requiredAction: string
  shortDetail: string
  /** The seat the item is about, when it is about one. */
  seatRole: SeatRole | null
  subjectId?: string
  removed?: RemovedMemberRow
  facts: RosterFactRow[]
  /** Present while the item is open. */
  replacement?: ReplacementSetRow
  resolution?: ResolutionRow
}

export interface PublishCheckRow {
  /** `P-101`. */
  pairingId: string
  dateLabel: string
  base: string
  detail: string
  status: string
  tone: 'good' | 'bad'
}

export interface FixPublishState {
  rosterRun: RunInfoRow | null
  assignments: LegAssignmentRow[]
  breaks: FixBreakRow[]
  publishChecks: PublishCheckRow[]
  /** Legs with a seat nobody has filled yet. */
  uncoveredLegIds: string[]
  limits: RuleLimitsRow | null
}

export interface FixOutcome {
  /** The green or amber sentence for the panel. */
  banner: string
  /** False when the edit was made but the break is still open. */
  closed: boolean
  state: FixPublishState
}

export interface WindowParams {
  dateFrom: string
  dateTo: string
  base: string
}

export interface SickCallInput {
  legId: string
  memberId: string
  reason: string
}

const COMPANY_RULES: ReadonlySet<string> = new Set(['NO_LOCAL_CREW', 'POLICE_MIN', 'POLICE_NO_SEAT'])

/** Rules written against one person, closed by putting somebody else in that person's seat. */
const PERSON_RULES: ReadonlySet<string> = new Set([
  'REST_SHORT',
  'OVERLAP',
  'HOURS_28D',
  'LICENCE_EXPIRED',
  'NO_TYPE_RATING',
  'WRONG_FLEET',
])

/** Rule numbers as the "Rules used" card on Assign crew prints them. */
const RULE_NUMBER = { REST_SHORT: 2, HOURS_28D: 3, OVERLAP: 4 } as const

const ROLE_LABEL: Record<SeatRole, string> = {
  captain: 'Captain',
  first_officer: 'First officer',
  cabin_crew: 'Cabin crew',
  police: 'Police',
}

const ROLE_NOUN: Record<SeatRole, { one: string; many: string }> = {
  captain: { one: 'captain', many: 'captains' },
  first_officer: { one: 'first officer', many: 'first officers' },
  cabin_crew: { one: 'cabin crew member', many: 'cabin crew' },
  police: { one: 'police officer', many: 'police officers' },
}

const CLOSED_VERB: Record<SeatRole, string> = {
  captain: 'captain swapped',
  first_officer: 'first officer swapped',
  cabin_crew: 'cabin crew added',
  police: 'police added',
}

/** Removals made by a swap are not sick calls, so they carry this prefix and are skipped. */
const SWAP_REASON = 'swapped by Ops'

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

const BREAK_SELECT = {
  id: true,
  roster_run_id: true,
  pairing_id: true,
  pairing_leg_id: true,
  crew_id: true,
  role: true,
  rule: true,
  detail: true,
  created_at: true,
  resolved_at: true,
  resolution: true,
  override_reason: true,
} satisfies Prisma.rule_breakSelect

type CrewDbRow = Prisma.crewGetPayload<{ select: typeof CREW_SELECT }>
type BreakDbRow = Prisma.rule_breakGetPayload<{ select: typeof BREAK_SELECT }>

/** One person's other flight, from any run. */
interface BusyLeg {
  legId: string
  pairingId: string
  flightNumber: string
  dep: Date
  arr: Date
}

interface ActiveAssignment {
  id: string
  crewId: string
  pairingId: string
  legId: string
  role: SeatRole
}

interface World {
  base: string
  pairings: RunPairing[]
  context: Context
  legs: Map<string, Leg>
  pairingById: Map<string, RunPairing>
  assignments: ActiveAssignment[]
  /** Crew at the run's base, who are the only ones offered for a seat. */
  pool: CrewDbRow[]
  crewById: Map<string, CrewDbRow>
  /** Active assignments of everyone in the pool, from any run, in the window the rules look at. */
  busy: Map<string, BusyLeg[]>
  /** Who came off which seat, newest first, keyed `legId|role`. */
  removed: Map<string, RemovedMemberRow>
}

/** How a break can be closed by changing who is on the roster. */
interface Plan {
  mode: 'add' | 'replace-subject' | 'replace-non-speaker' | 'none'
  role: SeatRole | null
  /** The legs the new person goes on. */
  scope: Leg[]
  subjectId?: string
  /** Languages the new person must speak, for `NO_LOCAL_CREW`. */
  languages: string[]
  blockedNote?: string
}

const HOUR = 3_600_000
const DAY = 86_400_000

@Injectable()
export class FixPublishService {
  constructor(
    private readonly db: DbService,
    private readonly assignCrew: AssignCrewService,
  ) {}

  /** The run Build pairings committed for exactly this base and window, with everything the page shows. */
  async getState(params: WindowParams): Promise<FixPublishState> {
    const window = { gte: new Date(`${params.dateFrom}T00:00:00.000Z`), lte: new Date(`${params.dateTo}T00:00:00.000Z`) }
    const run = await this.db.roster_run.findFirst({
      where: { base_airport: params.base, date_from: window.gte, date_to: window.lte },
      select: { id: true },
      orderBy: { created_at: 'desc' },
    })
    return run
      ? this.buildState(run.id)
      : { rosterRun: null, assignments: [], breaks: [], publishChecks: [], uncoveredLegIds: [], limits: null }
  }

  /** Re-checks every rule against the roster as it stands now, then returns the page state. */
  async check(rosterRunId: string): Promise<FixPublishState> {
    await this.assignCrew.check(rosterRunId)
    return this.buildState(rosterRunId)
  }

  /**
   * Puts somebody on the seat a break names, then re-checks.
   *
   * The candidate is checked again inside the transaction, after taking a lock on their
   * crew row, so two people fixing two breaks cannot put the same person on overlapping
   * duties. The break closes only if the re-check says its rule now passes.
   */
  async swap(breakId: string, replacementId: string, actorUserId: string | undefined): Promise<FixOutcome> {
    const brk = await this.readBreak(breakId)
    if (brk.resolved_at !== null) throw new ConflictException('This item is already closed')

    const world = await this.loadWorld(this.db, brk.roster_run_id)
    const plan = this.planFor(brk, world)
    if (plan.mode === 'none' || plan.role === null)
      throw new ConflictException(plan.blockedNote ?? 'Nobody can be swapped in for this item')
    const chosen = world.pool.find((member) => member.id === replacementId)
    if (!chosen) throw new NotFoundException('That crew member is not in the pool for this base')

    const flightNumber = world.legs.get(brk.pairing_leg_id)?.flightNumber ?? 'this leg'
    const pairingCode = world.pairingById.get(brk.pairing_id)?.code ?? ''
    const fullName = `${chosen.first_name} ${chosen.last_name}`
    const role = plan.role

    const outgoing = await this.db.$transaction(async (tx) => {
      // Run first, then crew: publish takes the run lock alone, so the two can never wait on each other in a circle.
      await tx.$queryRaw`SELECT id FROM roster_run WHERE id = ${brk.roster_run_id}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM crew WHERE id = ${replacementId}::uuid FOR UPDATE`

      const fresh = await this.loadWorld(tx, brk.roster_run_id)
      const freshPlan = this.planFor(brk, fresh)
      const candidate = this.candidateFor(chosen, freshPlan, fresh)
      if (!candidate.allowed) {
        const why = candidate.checks.find((check) => !check.ok)
        throw new ConflictException(`${fullName} cannot take this seat: ${why?.reason ?? why?.label ?? 'a rule fails'}`)
      }

      const scopeIds = freshPlan.scope.map((item) => item.id)
      const leaving = this.leavingRows(freshPlan, fresh)
      if (leaving.length > 0) {
        await tx.pairing_leg_assignment.updateMany({
          where: { id: { in: leaving.map((row) => row.id) } },
          data: { unassigned_at: new Date(), reason: SWAP_REASON },
        })
      }
      await tx.pairing_leg_assignment.createMany({
        data: freshPlan.scope.map((item) => ({
          pairing_id: item.pairingId,
          pairing_leg_id: item.id,
          crew_id: chosen.id,
          role,
          assigned_by: 'ops',
          assigned_at: new Date(),
        })),
      })

      const left = [...new Set(leaving.map((row) => fresh.crewById.get(row.crewId)).filter((member): member is CrewDbRow => !!member))]
      const names = left.map((member) => shortName(member))
      const summary = `${shortName(chosen)} ${names.length > 0 ? `replaced ${names.join(', ')}` : 'added'} on ${pairingCode} · ${flightNumber}`
      await tx.audit_log.create({
        data: {
          occurred_at: new Date(),
          actor_type: 'staff',
          actor_id: actorUserId ?? null,
          source_feature: '8',
          action: 'update',
          entity_type: 'rule_break',
          entity_id: breakId,
          summary,
          before: { rule: brk.rule, detail: brk.detail, crew: left.map((member) => member.id) },
          after: { resolution: 'swap', short: CLOSED_VERB[role], crew: chosen.id, role, legs: scopeIds },
        },
      })
      return names
    })

    const state = await this.check(brk.roster_run_id)
    const closed = state.breaks.find((item) => item.id === breakId)?.resolution !== undefined
    const replaced = outgoing.length > 0 ? `replaced ${outgoing.join(', ')}` : 'added'
    return {
      closed,
      state,
      banner: closed
        ? `${brk.rule} fixed · ${fullName} ${replaced} as ${ROLE_LABEL[role].toLowerCase()} on ${flightNumber}. Re-checked: this rule passes.`
        : `${fullName} was put on ${flightNumber} as ${ROLE_LABEL[role].toLowerCase()}, but ${brk.rule} is still open. See the item for what is left.`,
    }
  }

  /** Closes a company-rule break in writing. The reason goes to the break and to the audit log in one write. */
  async override(breakId: string, reason: string, actorUserId: string | undefined): Promise<FixOutcome> {
    const brk = await this.readBreak(breakId)
    if (brk.resolved_at !== null) throw new ConflictException('This item is already closed')
    if (!COMPANY_RULES.has(brk.rule)) {
      throw new BadRequestException(`${brk.rule} is a law rule and cannot be overridden. Fix it with a swap.`)
    }
    const staff = actorUserId
      ? await this.db.staff.findFirst({ where: { user_id: actorUserId, deleted_at: null }, select: { id: true } })
      : null
    if (!staff)
      throw new BadRequestException('Your account has no staff profile, so an override cannot be signed. Sign in with a staff account.')

    const world = await this.loadWorld(this.db, brk.roster_run_id)
    const flightNumber = world.legs.get(brk.pairing_leg_id)?.flightNumber ?? ''

    await this.db.$transaction(async (tx) => {
      const done = await tx.rule_break.updateMany({
        where: { id: breakId, resolved_at: null },
        data: { resolved_at: new Date(), resolution: 'overridden', overridden_by: staff.id, override_reason: reason },
      })
      if (done.count === 0) throw new ConflictException('This item was closed while you were writing the reason')
      await tx.audit_log.create({
        data: {
          occurred_at: new Date(),
          actor_type: 'staff',
          actor_id: actorUserId ?? null,
          source_feature: '8',
          action: 'update',
          entity_type: 'rule_break',
          entity_id: breakId,
          summary: `${brk.rule} overridden on ${flightNumber}`,
          reason,
          before: { rule: brk.rule, detail: brk.detail },
          after: { resolution: 'overridden', override_reason: reason },
        },
      })
    })

    return {
      closed: true,
      state: await this.buildState(brk.roster_run_id),
      banner: `${brk.rule} overridden · "${reason}${reason.endsWith('.') ? '' : '.'}" Saved to the audit log (Feature 15).`,
    }
  }

  /**
   * Takes somebody off one leg. The seat stays empty — nothing is filled automatically —
   * and the re-check reports it as an open item for the operator.
   */
  async raiseSickCall(rosterRunId: string, input: SickCallInput, actorUserId: string | undefined): Promise<FixOutcome> {
    const row = await this.db.pairing_leg_assignment.findFirst({
      where: {
        pairing_leg_id: input.legId,
        crew_id: input.memberId,
        unassigned_at: null,
        roster_run_pairing: { roster_run_id: rosterRunId },
      },
      select: {
        id: true,
        role: true,
        crew: { select: { first_name: true, last_name: true } },
        pairing_leg: { select: { flight: { select: { flight_number: true } } } },
      },
    })
    if (!row) throw new NotFoundException('That crew member is not on this leg of the run')

    const name = shortName(row.crew)
    const flightNumber = row.pairing_leg.flight.flight_number
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM roster_run WHERE id = ${rosterRunId}::uuid FOR UPDATE`
      await tx.pairing_leg_assignment.update({ where: { id: row.id }, data: { unassigned_at: new Date(), reason: input.reason } })
      await tx.audit_log.create({
        data: {
          occurred_at: new Date(),
          actor_type: 'staff',
          actor_id: actorUserId ?? null,
          source_feature: '8',
          action: 'update',
          entity_type: 'pairing_leg_assignment',
          entity_id: row.id,
          summary: `${name} came off ${flightNumber}`,
          reason: input.reason,
          before: { crew_id: input.memberId, role: row.role },
          after: { unassigned: true },
        },
      })
    })

    const state = await this.check(rosterRunId)
    return {
      closed: false,
      state,
      banner: `${name} came off ${flightNumber} (${input.reason.toLowerCase()}). The seat is open: find cover below.`,
    }
  }

  /**
   * Publishes the run, after one more check.
   *
   * Refused while any break is open: publishing is the point at which the roster stops
   * being a draft, so this is a gate and not a warning. The count is taken again inside
   * the transaction that flips the status.
   */
  async publish(rosterRunId: string, actorUserId: string | undefined): Promise<FixPublishState> {
    const run = await this.db.roster_run.findUnique({ where: { id: rosterRunId }, select: { id: true, status: true } })
    if (!run) throw new NotFoundException(`Roster run ${rosterRunId} was not found`)
    if (run.status === 'published') throw new ConflictException('This roster is already published')

    await this.db.$transaction(
      async (tx) => {
        // The run row is locked before anything is read, so a swap or sick call cannot slip in between the check and
        // the flip, and a second publish waits here and then finds the run already published.
        const [locked] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM roster_run WHERE id = ${rosterRunId}::uuid FOR UPDATE`
        if (!locked) throw new NotFoundException(`Roster run ${rosterRunId} was not found`)
        if (locked.status === 'published') throw new ConflictException('This roster is already published')

        // Checked again under the lock, so what is counted below is the roster as it stands now.
        await this.assignCrew.check(rosterRunId)

        const pairings = await tx.roster_run_pairing.count({ where: { roster_run_id: rosterRunId } })
        if (pairings === 0) throw new ConflictException('ROSTER_EMPTY · Commit at least one pairing in Build pairings before publishing')
        const open = await tx.rule_break.count({ where: { roster_run_id: rosterRunId, resolved_at: null } })
        if (open > 0) throw new ConflictException(`ROSTER_HAS_BREAKS · close ${open} open ${open === 1 ? 'break' : 'breaks'} to publish`)

        const now = new Date()
        const flipped = await tx.roster_run.updateMany({
          where: { id: rosterRunId, status: 'draft' },
          data: { status: 'published', published_at: now, updated_at: now },
        })
        if (flipped.count === 0) throw new ConflictException('This roster is already published')
        await tx.audit_log.create({
          data: {
            occurred_at: now,
            actor_type: 'staff',
            actor_id: actorUserId ?? null,
            source_feature: '8',
            action: 'status_change',
            entity_type: 'roster_run',
            entity_id: rosterRunId,
            summary: 'Roster published',
            before: { status: 'draft' },
            after: { status: 'published', published_at: now.toISOString() },
          },
        })
      },
      { timeout: 30_000 },
    )

    return this.buildState(rosterRunId)
  }

  /* ── state ──────────────────────────────────────────────────────────────── */

  private async buildState(rosterRunId: string): Promise<FixPublishState> {
    const world = await this.loadWorld(this.db, rosterRunId)
    const [runRow, current, rows] = await Promise.all([
      this.db.roster_run.findUniqueOrThrow({ where: { id: rosterRunId }, select: { published_at: true } }),
      this.assignCrew.getRun(rosterRunId),
      this.db.rule_break.findMany({
        where: { roster_run_id: rosterRunId },
        select: BREAK_SELECT,
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      }),
    ])

    const closedFixed = rows.filter((row) => row.resolved_at !== null && row.resolution === 'fixed').map((row) => row.id)
    const trail = await this.swapTrail(closedFixed)

    const breaks = rows.map((row, index) => this.toFixBreakRow(row, index + 1, world, trail))
    const uncovered = new Set(
      breaks.filter((item) => item.resolution === undefined && item.code === 'NO_LEGAL_CREW').map((item) => item.legId),
    )

    return {
      rosterRun: { ...current.rosterRun, publishedAt: runRow.published_at === null ? null : runRow.published_at.toISOString() },
      assignments: current.assignments,
      breaks,
      publishChecks: this.publishChecks(world, breaks, current.rosterRun.status),
      uncoveredLegIds: [...uncovered],
      limits: world.pairings[0]?.limits ?? world.context.defaults,
    }
  }

  private toFixBreakRow(
    row: BreakDbRow,
    position: number,
    world: World,
    trail: Map<string, { summary: string; short: string }>,
  ): FixBreakRow {
    const leg = world.legs.get(row.pairing_leg_id)
    const pairing = world.pairingById.get(row.pairing_id)
    const rule = row.rule as RuleCode
    const open = row.resolved_at === null
    const plan = this.planFor(row, world)
    const seatRole = plan.role ?? (row.role as SeatRole | null)
    const subject = row.crew_id ? world.crewById.get(row.crew_id) : undefined
    const removed = open && row.rule === 'NO_LEGAL_CREW' && row.role ? world.removed.get(`${row.pairing_leg_id}|${row.role}`) : undefined

    const onLeg = world.assignments.filter((item) => item.legId === row.pairing_leg_id)
    const count = (role: SeatRole): number => onLeg.filter((item) => item.role === role).length

    const facts: RosterFactRow[] = [
      { label: 'Pairing', value: pairing?.code ?? '—' },
      { label: 'Leg', value: leg ? `${leg.origin} ➔ ${leg.destination} · ${stamp(leg.dep, world.context.timeZone)}` : '—' },
    ]
    if (removed) facts.push({ label: 'Came off', value: `${removed.name} · ${ROLE_LABEL[removed.role]} · ${removed.reason}` })
    if (subject)
      facts.push({ label: 'Crew member', value: `${shortName(subject)} · ${ROLE_LABEL[subject.role as SeatRole] ?? subject.role}` })
    if (row.rule === 'POLICE_MIN' && pairing) {
      facts.push({ label: 'Police on this leg', value: `${count('police')} of ${pairing.limits.minPoliceInternational}`, danger: open })
    }
    if (row.rule === 'NO_LEGAL_CREW' && row.role) {
      const need = row.role === 'cabin_crew' ? (pairing?.limits.cabinCrewPerLeg ?? 4) : 1
      facts.push({ label: ROLE_LABEL[row.role as SeatRole], value: `${count(row.role as SeatRole)} of ${need}`, danger: open })
    }
    if (row.rule === 'NO_LOCAL_CREW' && leg) {
      facts.push({
        label: 'Local languages',
        value: leg.localLanguages.length > 0 ? leg.localLanguages.join(', ').toUpperCase() : 'none set',
        danger: open,
      })
    }
    const requiredAction = this.requiredAction(row, plan, subject, pairing)
    if (open) facts.push({ label: 'Needed', value: requiredAction, danger: true })

    return {
      id: row.id,
      code: rule,
      title: removed ? 'SICK CALL' : rule,
      severity: COMPANY_RULES.has(row.rule) ? 'company' : 'law',
      position,
      pairingId: row.pairing_id,
      pairingCode: pairing?.code ?? '',
      legId: row.pairing_leg_id,
      flightNumber: leg?.flightNumber ?? '',
      context: `${pairing?.code ?? ''} · ${leg?.flightNumber ?? ''} ${leg?.origin ?? ''} ➔ ${leg?.destination ?? ''}`,
      explanation: row.detail,
      requiredAction,
      shortDetail: row.detail,
      seatRole,
      subjectId: row.crew_id ?? undefined,
      removed,
      facts,
      replacement: open ? this.replacementSet(plan, world) : undefined,
      resolution: open ? undefined : this.resolutionFor(row, rule, seatRole, trail),
    }
  }

  private resolutionFor(
    row: BreakDbRow,
    rule: RuleCode,
    seatRole: SeatRole | null,
    trail: Map<string, { summary: string; short: string }>,
  ): ResolutionRow {
    if (row.resolution === 'overridden') {
      const reason = row.override_reason ?? ''
      return {
        kind: 'overridden',
        summary: `Reason: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`,
        short: 'reason logged',
        reason,
        banner: `${rule} overridden · "${reason}${reason.endsWith('.') ? '' : '.'}" Saved to the audit log (Feature 15).`,
      }
    }
    const swapped = trail.get(row.id)
    return {
      kind: 'fixed',
      summary: swapped?.summary ?? 'Re-checked: this rule now passes',
      short: swapped?.short ?? (seatRole ? CLOSED_VERB[seatRole] : 'fixed'),
      banner: swapped
        ? `${rule} fixed · ${swapped.summary}. Re-checked: this rule passes.`
        : `${rule} fixed · re-checked: this rule now passes.`,
    }
  }

  private requiredAction(row: BreakDbRow, plan: Plan, subject: CrewDbRow | undefined, pairing: RunPairing | undefined): string {
    switch (row.rule) {
      case 'POLICE_MIN':
      case 'POLICE_NO_SEAT':
        return 'Add 1 police officer'
      case 'NO_LOCAL_CREW':
        return plan.languages.length > 0
          ? `Add 1 cabin crew who speaks ${plan.languages.join(' or ').toUpperCase()}`
          : 'Set local languages in Setup rules'
      case 'NO_LEGAL_CREW': {
        const role = (row.role as SeatRole | null) ?? 'captain'
        return `Add 1 ${ROLE_LABEL[role].toLowerCase()}${role === 'cabin_crew' ? ` (${pairing?.limits.cabinCrewPerLeg ?? 4} per leg)` : ''}`
      }
      case 'DUTY_LIMIT':
        return 'Change the pairing in Build pairings'
      default:
        return subject ? `Replace ${shortName(subject)}` : 'Replace the crew member'
    }
  }

  /** One row per pairing in the run, for the table above the publish button. */
  private publishChecks(world: World, breaks: FixBreakRow[], status: 'draft' | 'published'): PublishCheckRow[] {
    return world.pairings.map((pairing) => {
      const first = pairing.legs[0]
      const route = first ? [first.origin, ...pairing.legs.map((leg) => leg.destination)].join(' → ') : pairing.code
      const open = breaks.filter((item) => item.pairingId === pairing.id && item.resolution === undefined)
      const seat = open.find((item) => item.code === 'NO_LEGAL_CREW')
      const detail =
        open.length === 0 ? `${route} · all checks clear` : `${route} · ${open[0].flightNumber} ${open[0].shortDetail} (${open[0].code})`
      return {
        pairingId: pairing.code,
        dateLabel: first ? stamp(first.dep, world.context.timeZone).split(',')[0] : '—',
        base: world.base,
        detail,
        status: seat ? 'Not covered' : open.length > 0 ? 'Rule break' : status === 'published' ? 'Published ✓' : 'Ready to publish',
        tone: open.length > 0 ? 'bad' : 'good',
      }
    })
  }

  /* ── replacement ────────────────────────────────────────────────────────── */

  /** How this break can be closed by changing who is on the roster. */
  private planFor(row: BreakDbRow, world: World): Plan {
    const none = (blockedNote: string): Plan => ({ mode: 'none', role: null, scope: [], languages: [], blockedNote })
    const leg = world.legs.get(row.pairing_leg_id)
    const pairing = world.pairingById.get(row.pairing_id)
    if (!leg || !pairing) return none('This leg is no longer in the run.')

    if (row.rule === 'NO_LEGAL_CREW' && row.role) return { mode: 'add', role: row.role as SeatRole, scope: [leg], languages: [] }
    if (row.rule === 'POLICE_MIN' || row.rule === 'POLICE_NO_SEAT') return { mode: 'add', role: 'police', scope: [leg], languages: [] }

    if (row.rule === 'NO_LOCAL_CREW') {
      if (leg.localLanguages.length === 0) {
        return none(`No local languages are set for ${leg.destinationCountry.toUpperCase()}. Add them in Setup rules, then re-check.`)
      }
      const cabin = world.assignments.filter((item) => item.legId === leg.id && item.role === 'cabin_crew').length
      return {
        mode: cabin < pairing.limits.cabinCrewPerLeg ? 'add' : 'replace-non-speaker',
        role: 'cabin_crew',
        scope: [leg],
        languages: [...leg.localLanguages],
      }
    }

    if (PERSON_RULES.has(row.rule) && row.crew_id) {
      const mine = world.assignments.filter((item) => item.crewId === row.crew_id && item.pairingId === row.pairing_id)
      const role = mine.find((item) => item.legId === row.pairing_leg_id)?.role ?? mine[0]?.role
      if (!role) return none('That crew member is already off this pairing, so there is nothing left to swap. Re-check the roster.')
      const scope = pairing.legs.filter((item) => mine.some((assignment) => assignment.legId === item.id))
      return { mode: 'replace-subject', role, scope, subjectId: row.crew_id, languages: [] }
    }

    return none('This rule is about the pairing itself, not a person, so a swap cannot close it. Change the pairing in Build pairings.')
  }

  /**
   * The assignments a swap takes off the roster.
   *
   * Swapping out a person takes that person off. Closing `NO_LOCAL_CREW` takes **one** cabin crew member who does
   * not speak the language off each leg, which is what the page says, so the cabin keeps its size: one comes off,
   * the speaker goes on. They are picked by name so the same swap always lets the same person go.
   */
  private leavingRows(plan: Plan, world: World): ActiveAssignment[] {
    const scopeIds = new Set(plan.scope.map((leg) => leg.id))
    const onScope = world.assignments.filter((row) => scopeIds.has(row.legId))

    if (plan.mode === 'replace-subject') return onScope.filter((row) => row.crewId === plan.subjectId)
    if (plan.mode !== 'replace-non-speaker') return []

    const nameOf = (row: ActiveAssignment) => {
      const member = world.crewById.get(row.crewId)
      return member ? `${member.last_name} ${member.first_name}` : ''
    }
    const nonSpeakers = onScope
      .filter((row) => {
        const member = world.crewById.get(row.crewId)
        return row.role === 'cabin_crew' && !!member && !plan.languages.some((language) => member.languages.includes(language))
      })
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || a.id.localeCompare(b.id))

    const onePerLeg = new Map<string, ActiveAssignment>()
    for (const row of nonSpeakers) if (!onePerLeg.has(row.legId)) onePerLeg.set(row.legId, row)
    return [...onePerLeg.values()]
  }

  private replacementSet(plan: Plan, world: World): ReplacementSetRow {
    const role = plan.role
    if (plan.mode === 'none' || role === null) {
      return { availableLabel: 'Nobody can be offered', allowedCount: 0, instruction: '', blockedNote: plan.blockedNote, candidates: [] }
    }

    const scopeIds = new Set(plan.scope.map((leg) => leg.id))
    const taken = new Set(world.assignments.filter((item) => scopeIds.has(item.legId)).map((item) => item.crewId))
    const candidates = world.pool
      .filter((member) => member.role === role && member.id !== plan.subjectId && !taken.has(member.id))
      .map((member) => this.candidateFor(member, plan, world))
      .sort((a, b) => Number(b.allowed) - Number(a.allowed) || a.member.fullName.localeCompare(b.member.fullName))

    const allowed = candidates.filter((candidate) => candidate.allowed).length
    const flight = plan.scope[0]?.flightNumber ?? 'this leg'
    const speakers = plan.languages.join(' or ').toUpperCase()
    return {
      availableLabel: `${allowed} legal ${allowed === 1 ? ROLE_NOUN[role].one : ROLE_NOUN[role].many} available`,
      allowedCount: allowed,
      instruction:
        plan.mode === 'replace-subject'
          ? `Swap a legal ${ROLE_LABEL[role].toLowerCase()} onto ${plan.scope.length > 1 ? 'this pairing' : flight}. Everyone else stays.`
          : plan.mode === 'replace-non-speaker'
            ? `Swap a ${speakers}-speaking cabin crew member onto ${flight}. One cabin crew member who does not speak it comes off.`
            : `Add a legal ${ROLE_LABEL[role].toLowerCase()} to ${flight}. Everyone else stays.`,
      blockedNote:
        allowed === 0
          ? `Every ${ROLE_LABEL[role].toLowerCase()} at ${world.base} fails at least one rule for ${flight}, so nobody can be added.`
          : undefined,
      candidates,
    }
  }

  /** One person against every rule that decides whether they may take the seat. */
  private candidateFor(member: CrewDbRow, plan: Plan, world: World): ReplacementCandidateRow {
    const scope = plan.scope
    const limits = world.pairings.find((pairing) => pairing.id === scope[0]?.pairingId)?.limits ?? world.context.defaults
    const scopeIds = new Set(scope.map((leg) => leg.id))
    const others = (world.busy.get(member.id) ?? []).filter((item) => !scopeIds.has(item.legId))
    const checks: CandidateCheckRow[] = []

    const lastDate = scope.reduce((latest, leg) => (leg.serviceDate > latest ? leg.serviceDate : latest), '')
    const model = scope[0]?.aircraftType ?? ''
    const role = member.role as SeatRole
    const isPilot = role === 'captain' || role === 'first_officer'
    // A sick call leaves the seat empty with no subject, so the person who came off has to be ruled out here.
    const cameOff = scope.some((leg) => world.removed.get(`${leg.id}|${member.role}`)?.crewId === member.id)
    // The picker already filters on both, so these only bite when a swap is asked for directly: the seat is the
    // plan's role, and nobody takes a second seat on a leg they are already crewed on.
    const alreadyOnLeg = world.assignments.some((item) => scopeIds.has(item.legId) && item.crewId === member.id)
    let eligible: string | undefined
    if (plan.role !== null && member.role !== plan.role) {
      eligible = `${shortName(member)} is ${ROLE_NOUN[member.role as SeatRole].one}, not ${ROLE_NOUN[plan.role].one}.`
    } else if (alreadyOnLeg) {
      eligible = `${shortName(member)} is already crewed on this flight.`
    } else if (cameOff) {
      eligible = `${shortName(member)} came off this seat and cannot cover it.`
    } else if (isoDate(member.licence_expires_on) < lastDate) {
      eligible = `Licence expires ${isoDate(member.licence_expires_on)}, before ${lastDate}.`
    } else if (role !== 'police' && scope.some((leg) => leg.aircraftType !== member.fleet_aircraft_type)) {
      eligible = `Flies the ${member.fleet_aircraft_type}, but this flight is a ${model}.`
    } else if (
      isPilot &&
      !member.crew_certification.some((cert) =>
        scope.every((leg) => cert.aircraft_type === leg.aircraftType && isoDate(cert.expires_on) >= leg.serviceDate),
      )
    ) {
      eligible = `No valid ${model} type rating on ${lastDate}.`
    }
    checks.push({ label: 'Eligible & available', ok: eligible === undefined, reason: eligible })

    if (plan.languages.length > 0) {
      const speaks = plan.languages.some((language) => member.languages.includes(language))
      checks.push({
        label: `Speaks ${plan.languages.join('/').toUpperCase()}`,
        ok: speaks,
        reason: speaks ? undefined : `Does not speak ${plan.languages.join(' or ').toUpperCase()}.`,
      })
    }

    const start = Math.min(...scope.map((leg) => leg.dep.getTime())) - limits.reportMinutes * 60_000
    const end = Math.max(...scope.map((leg) => leg.arr.getTime())) + limits.releaseMinutes * 60_000
    let gap = Number.POSITIVE_INFINITY
    for (const other of others) {
      const otherStart = other.dep.getTime() - limits.reportMinutes * 60_000
      const otherEnd = other.arr.getTime() + limits.releaseMinutes * 60_000
      gap = Math.min(gap, otherEnd <= start ? start - otherEnd : otherStart >= end ? otherStart - end : 0)
    }
    const restHours = Math.round((gap / HOUR) * 10) / 10
    const restOk = !Number.isFinite(gap) || restHours >= limits.minRestHours
    checks.push({
      label: Number.isFinite(gap) ? `Rest ${restHours} h` : 'Rest clear',
      ok: restOk,
      reason: restOk
        ? undefined
        : `Only ${restHours} h rest between duties; the minimum is ${limits.minRestHours} h (rule ${RULE_NUMBER.REST_SHORT}).`,
    })

    const block = scope.reduce((total, leg) => total + (leg.arr.getTime() - leg.dep.getTime()), 0)
    const flown = others
      .filter((other) => other.dep.getTime() > end - 28 * DAY && other.dep.getTime() <= end)
      .reduce((total, other) => total + (other.arr.getTime() - other.dep.getTime()), 0)
    const hours = Math.round(((flown + block) / HOUR) * 10) / 10
    const hoursOk = hours <= limits.maxFlightHours28d
    checks.push({
      label: `${hours} / ${limits.maxFlightHours28d} h`,
      ok: hoursOk,
      reason: hoursOk ? undefined : `Would exceed ${limits.maxFlightHours28d} flight hours in 28 days (rule ${RULE_NUMBER.HOURS_28D}).`,
    })

    const clash = others.find((other) => scope.some((leg) => other.dep < leg.arr && leg.dep < other.arr))
    checks.push({
      label: 'No overlap',
      ok: clash === undefined,
      reason: clash ? `Overlaps ${clash.flightNumber} (rule ${RULE_NUMBER.OVERLAP}).` : undefined,
    })

    return {
      member: {
        id: member.id,
        name: shortName(member),
        fullName: `${member.first_name} ${member.last_name}`,
        role,
        languages: member.languages,
      },
      checks,
      allowed: checks.every((check) => check.ok),
    }
  }

  /* ── loading ────────────────────────────────────────────────────────────── */

  /** Everything the page and the candidate rules read, in a handful of queries. */
  private async loadWorld(client: Prisma.TransactionClient, rosterRunId: string): Promise<World> {
    const { run, pairings, context } = await this.assignCrew.loadRun(rosterRunId)
    const legs = new Map(pairings.flatMap((pairing) => pairing.legs.map((leg) => [leg.id, leg] as const)))
    const pairingIds = pairings.map((pairing) => pairing.id)

    const deps = [...legs.values()].map((leg) => leg.dep.getTime())
    const from = new Date((deps.length > 0 ? Math.min(...deps) : Date.now()) - 28 * DAY)
    const to = new Date((deps.length > 0 ? Math.max(...deps) : Date.now()) + 3 * DAY)

    const pool = await client.crew.findMany({
      where: { deleted_at: null, base_airport: run.base_airport },
      select: CREW_SELECT,
      orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
    })

    const [active, history, off] = await Promise.all([
      client.pairing_leg_assignment.findMany({
        where: { pairing_id: { in: pairingIds }, unassigned_at: null },
        select: { id: true, crew_id: true, pairing_id: true, pairing_leg_id: true, role: true, crew: { select: CREW_SELECT } },
      }),
      client.pairing_leg_assignment.findMany({
        where: {
          crew_id: { in: pool.map((member) => member.id) },
          unassigned_at: null,
          pairing_leg: { flight: { dep_at: { gte: from, lte: to } } },
        },
        select: {
          crew_id: true,
          pairing_id: true,
          pairing_leg_id: true,
          pairing_leg: { select: { flight: { select: { flight_number: true, dep_at: true, arr_at: true } } } },
        },
      }),
      client.pairing_leg_assignment.findMany({
        where: { pairing_id: { in: pairingIds }, unassigned_at: { not: null } },
        select: {
          pairing_leg_id: true,
          crew_id: true,
          role: true,
          reason: true,
          unassigned_at: true,
          crew: { select: { first_name: true, last_name: true } },
        },
        orderBy: { unassigned_at: 'desc' },
      }),
    ])

    const crewById = new Map(pool.map((member) => [member.id, member]))
    for (const row of active) crewById.set(row.crew_id, row.crew)

    const busy = new Map<string, BusyLeg[]>()
    for (const row of history) {
      const entry = {
        legId: row.pairing_leg_id,
        pairingId: row.pairing_id,
        flightNumber: row.pairing_leg.flight.flight_number,
        dep: row.pairing_leg.flight.dep_at,
        arr: row.pairing_leg.flight.arr_at,
      }
      busy.set(row.crew_id, [...(busy.get(row.crew_id) ?? []), entry])
    }

    const removed = new Map<string, RemovedMemberRow>()
    for (const row of off) {
      const key = `${row.pairing_leg_id}|${row.role}`
      if (removed.has(key) || (row.reason ?? '').startsWith(SWAP_REASON)) continue
      removed.set(key, { crewId: row.crew_id, name: shortName(row.crew), role: row.role as SeatRole, reason: row.reason ?? 'Removed' })
    }

    return {
      base: run.base_airport,
      pairings,
      context,
      legs,
      pairingById: new Map(pairings.map((pairing) => [pairing.id, pairing])),
      assignments: active.map((row) => ({
        id: row.id,
        crewId: row.crew_id,
        pairingId: row.pairing_id,
        legId: row.pairing_leg_id,
        role: row.role as SeatRole,
      })),
      pool,
      crewById,
      busy,
      removed,
    }
  }

  /** What each closed-by-swap break was closed with, read back from the audit log. */
  private async swapTrail(breakIds: string[]): Promise<Map<string, { summary: string; short: string }>> {
    const trail = new Map<string, { summary: string; short: string }>()
    if (breakIds.length === 0) return trail
    const rows = await this.db.audit_log.findMany({
      where: { source_feature: '8', entity_type: 'rule_break', entity_id: { in: breakIds }, action: 'update' },
      select: { entity_id: true, summary: true, after: true },
      orderBy: { occurred_at: 'desc' },
    })
    for (const row of rows) {
      if (row.entity_id === null || trail.has(row.entity_id)) continue
      const after = row.after as { resolution?: string; short?: string } | null
      if (after?.resolution !== 'swap') continue
      trail.set(row.entity_id, { summary: row.summary ?? 'Swapped', short: after.short ?? 'swapped' })
    }
    return trail
  }

  private async readBreak(breakId: string): Promise<BreakDbRow> {
    const row = await this.db.rule_break.findUnique({ where: { id: breakId }, select: BREAK_SELECT })
    if (!row) throw new NotFoundException(`Break ${breakId} was not found`)
    return row
  }
}

/** `15 Sep, 12:30` in the given timezone. */
function stamp(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(instant)
    .replace('Sept', 'Sep')
}
