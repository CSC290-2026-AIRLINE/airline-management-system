import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

/**
 * Feature 8 · Step 4 — fix and publish.
 *
 * Owns closing `rule_break` rows, the swaps that close them, and the act of
 * publishing a `roster_run`. It reads the roster that step 3 crewed through
 * `roster_run_pairing` and `pairing_leg_assignment`, never by importing that step's
 * service, so the two stay independently replaceable.
 *
 * Two rules the page turns on:
 *
 *  · There is no separate "fixed roster". Every edit rewrites `pairing_leg_assignment`
 *    and the break list is re-derived, so a swap that opens a second break shows up at
 *    once rather than at publish time.
 *
 *  · An override without a written reason is not a resolution. Both go to
 *    `rule_break.override_reason` and to `audit_log` in the same write, which is what
 *    Feature 15 reads back.
 */

export type FixRuleCode =
  | 'REST_SHORT'
  | 'POLICE_MIN'
  | 'NO_LOCAL_CREW'
  | 'DOUBLE_BOOKED'
  | 'DUTY_FLIGHTS'
  | 'DUTY_HOURS'
  | 'FLIGHT_HOURS_28D'
  | 'NO_LEGAL_CREW'
  | 'SICK_CALL'

export type ResolutionKind = 'fixed' | 'overridden'

export type PageTone = 'good' | 'bad'

export interface CandidateCheckRow {
  label: string
  ok: boolean
  reason?: string
}

export interface ReplacementCandidateRow {
  member: ReplacementMemberRow
  checks: CandidateCheckRow[]
  /** False when any check failed; the card still renders so the reason is visible. */
  allowed: boolean
}

export interface ReplacementMemberRow {
  id: string
  name: string
  fullName: string
  role: string
  languages: string[]
  typeRatings: string[]
  licenceExpiresOn: string
  hours28d: number
}

export interface ReplacementSetRow {
  /** `2 legal police officers available`, or `0 legal captains available`. */
  availableLabel: string
  allowedCount: number
  instruction: string
  blockedNote?: string
  candidates: ReplacementCandidateRow[]
}

export interface RosterFactRow {
  label: string
  value: string
  danger?: boolean
}

export interface RemovedMemberRow {
  name: string
  role: string
  reason: string
}

export interface ResolutionRow {
  kind: ResolutionKind
  summary: string
  /** `captain swapped`, `police added`, `reason logged`. */
  short: string
  reason?: string
  /** The green sentence inside the panel. */
  banner: string
}

export interface FixBreakRow {
  id: string
  code: FixRuleCode
  /** Panel heading. Same as `code` except the seat break, which reads `SICK CALL`. */
  title: string
  severity: 'law' | 'company'
  /** Fixed the first time the item appears; never renumbers when an earlier one closes. */
  position: number
  pairingId: string
  legId: string
  flightNumber: string
  context: string
  explanation: string
  requiredAction: string
  shortDetail: string
  seatRole: string
  subjectId?: string
  removed?: RemovedMemberRow
  facts: RosterFactRow[]
  replacement?: ReplacementSetRow
  resolution?: ResolutionRow
}

export interface SickCallRow {
  id: string
  legId: string
  memberId: string
  role: string
  removed: RemovedMemberRow
  replacementId?: string
}

export interface SickCallInput {
  rosterRunId: string
  legId: string
  memberId: string
  reason: string
}

export interface PublishCheckRow {
  pairingId: string
  dateLabel: string
  base: string
  detail: string
  status: string
  tone: PageTone
}

export interface RosterStatusRow {
  rosterRunId: string
  status: 'draft' | 'published'
  publishedAt: string | null
  openBreaks: number
  pairings: number
}

export interface PublishResultRow {
  rosterRunId: string
  status: 'published'
  publishedAt: string
  checks: PublishCheckRow[]
}

export interface SwapInput {
  /** `rule_break` row being closed. */
  breakId: string
  /** Crew member going on the seat. */
  replacementId: string
  note?: string
}

export interface OverrideInput {
  breakId: string
  reason: string
}

interface BreakDbRow {
  id: string
  roster_run_id: string
  pairing_id: string
  pairing_leg_id: string
  crew_id: string | null
  role: string | null
  rule: string
  title: string | null
  detail: string
  created_at: Date
  resolved_at: Date | null
  resolution: string | null
  overridden_by: string | null
  override_reason: string | null
  pairing_leg: {
    id: string
    pairing: { id: string; code: string; base_airport: string }
    flight: {
      id: string
      flight_number: string
      scheduled_dep_at: Date
      scheduled_arr_at: Date
      route: { origin: string; destination: string }
      aircraft: { aircraft_type: { code: string } }
    }
  }
}

interface CrewDbRow {
  id: string
  first_name: string
  last_name: string
  role: string
  base_airport: string
  languages: string[]
  licence_expires_on: Date
  fleet_aircraft_type: string
  crew_certification: { name: string; aircraft_type: string | null }[]
}

const BREAK_SELECT = {
  id: true,
  roster_run_id: true,
  pairing_id: true,
  pairing_leg_id: true,
  crew_id: true,
  role: true,
  rule: true,
  title: true,
  detail: true,
  created_at: true,
  resolved_at: true,
  resolution: true,
  overridden_by: true,
  override_reason: true,
  pairing_leg: {
    select: {
      id: true,
      pairing: { select: { id: true, code: true, base_airport: true } },
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
    },
  },
} as const

/** Which seat a break is about. Drives where a swap is written. */
const SEAT_FOR_RULE: Record<string, string> = {
  REST_SHORT: 'captain',
  DUTY_HOURS: 'captain',
  DUTY_FLIGHTS: 'first_officer',
  FLIGHT_HOURS_28D: 'captain',
  NO_LOCAL_CREW: 'local',
  POLICE_MIN: 'police',
  POLICE_NO_SEAT: 'police',
  OVERLAP: 'first_officer',
  NO_LEGAL_CREW: 'captain',
  LICENCE_EXPIRED: 'captain',
  NO_TYPE_RATING: 'first_officer',
}

/** Two-word verb per seat, used for the closed-table cell. */
const CLOSED_VERB: Record<string, string> = {
  captain: 'captain swapped',
  first_officer: 'first officer swapped',
  cabin: 'cabin crew added',
  local: 'local crew added',
  police: 'police added',
}

/** How a swap reads in the left list, e.g. `P. Thongdee now captains P-102`. */
const CREWED_VERB: Record<string, string> = {
  captain: 'now captains',
  first_officer: 'now flies as first officer',
  cabin: 'now works cabin crew',
  local: 'now works local crew',
  police: 'now works police',
}

/** Hours between two instants, rounded to one decimal. */
function hoursBetween(from: Date | string, to: Date | string): number {
  const a = from instanceof Date ? from.getTime() : Date.parse(from)
  const b = to instanceof Date ? to.getTime() : Date.parse(to)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round(((b - a) / 3_600_000) * 10) / 10
}

/** `YYYY-MM-DD` in UTC. */
function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10)
}

@Injectable()
export class FixPublishService {
  constructor(private readonly db: DbService) {}

  /**
   * Every item on the page: open breaks first, then the ones already closed.
   *
   * Positions are assigned once, from the order the breaks were raised, so closing
   * break 1 does not relabel break 3 underneath it.
   */
  async listFixBreaks(rosterRunId: string): Promise<FixBreakRow[]> {
    const rows = (await this.db.ruleBreak.findMany({
      where: { roster_run_id: rosterRunId },
      select: BREAK_SELECT,
      orderBy: { created_at: 'asc' },
    })) as unknown as BreakDbRow[]

    const open = rows.filter((row) => row.resolved_at === null)
    const closed = rows.filter((row) => row.resolved_at !== null)

    return Promise.all([...open, ...closed].map((row, index) => this.toFixBreakRow(row, index + 1)))
  }

  /** Where the roster stands before the operator touches anything. */
  async getRosterStatus(rosterRunId: string): Promise<RosterStatusRow> {
    const run = (await this.db.rosterRun.findUnique({
      where: { id: rosterRunId },
      select: { id: true, status: true, published_at: true },
    })) as { id: string; status: string; published_at: Date | null } | null
    if (!run) throw new NotFoundException(`Roster run ${rosterRunId} was not found`)

    const [openBreaks, links] = await Promise.all([
      this.db.ruleBreak.count({ where: { roster_run_id: rosterRunId, resolved_at: null } }),
      this.db.rosterRunPairing.count({ where: { roster_run_id: rosterRunId } }),
    ])

    return {
      rosterRunId,
      status: run.status === 'published' ? 'published' : 'draft',
      publishedAt: run.published_at === null ? null : run.published_at.toISOString(),
      openBreaks,
      pairings: links,
    }
  }

  /**
   * Who could take the seat this break names.
   *
   * Every candidate of the right role is returned, allowed or not — the operator needs
   * to see why somebody is ruled out, which is the reason the panel exists at all.
   */
  async getReplacementCandidates(breakId: string): Promise<ReplacementSetRow> {
    const row = await this.readBreak(breakId)
    const seatRole = SEAT_FOR_RULE[row.rule] ?? 'captain'

    const crew = (await this.db.crew.findMany({
      where: { deleted_at: null, role: seatRole },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        role: true,
        base_airport: true,
        languages: true,
        licence_expires_on: true,
        fleet_aircraft_type: true,
        crew_certification: { select: { name: true, aircraft_type: true } },
      },
      orderBy: { last_name: 'asc' },
    })) as unknown as CrewDbRow[]

    const limits = await this.readLimits()
    const flight = row.pairing_leg.flight
    const aircraftType = flight.aircraft.aircraft_type.code
    const serviceDate = isoDay(flight.scheduled_dep_at)

    const onLeg = new Set(
      (
        (await this.db.pairingLegAssignment.findMany({
          where: { pairing_leg_id: row.pairing_leg_id, unassigned_at: null },
          select: { crew_id: true },
        })) as { crew_id: string }[]
      ).map((entry) => entry.crew_id),
    )

    const candidates = await Promise.all(
      crew.map(async (member): Promise<ReplacementCandidateRow> => {
        const hours28d = await this.hours28d(member.id)
        const typeRatings = member.crew_certification
          .filter((cert) => cert.aircraft_type !== null)
          .map((cert) => cert.aircraft_type as string)
        const licenceOk = member.licence_expires_on.toISOString().slice(0, 10) >= serviceDate
        const typeOk = typeRatings.includes(aircraftType) || member.fleet_aircraft_type === aircraftType

        const checks: CandidateCheckRow[] = [
          { label: 'Licence', ok: licenceOk, reason: licenceOk ? undefined : `Expires ${isoDay(member.licence_expires_on)}` },
          { label: 'Type rating', ok: typeOk, reason: typeOk ? undefined : `Not rated on ${aircraftType}` },
          { label: 'On this leg', ok: !onLeg.has(member.id), reason: onLeg.has(member.id) ? 'Already assigned to this leg' : undefined },
          {
            label: 'Flight hours 28 d',
            ok: hours28d <= limits.maxFlightHours28d,
            reason: hours28d <= limits.maxFlightHours28d ? undefined : `${hours28d} h of ${limits.maxFlightHours28d} h`,
          },
        ]

        return {
          member: {
            id: member.id,
            name: `${member.first_name} ${member.last_name.charAt(0)}.`.trim(),
            fullName: `${member.first_name} ${member.last_name}`,
            role: member.role,
            languages: member.languages,
            typeRatings,
            licenceExpiresOn: isoDay(member.licence_expires_on),
            hours28d,
          },
          checks: checks.filter((check) => !check.ok || check.label !== 'On this leg'),
          allowed: checks.every((check) => check.ok),
        }
      }),
    )

    const allowed = candidates.filter((candidate) => candidate.allowed).length
    const destination = flight.route.destination
    const noun = seatRole === 'police' ? 'police officers' : seatRole === 'local' ? 'local crew' : `${seatRole.replace('_', ' ')}s`

    return {
      availableLabel: `${allowed} legal ${noun} available`,
      allowedCount: allowed,
      instruction: `Swap a legal ${seatRole.replace('_', ' ')} onto ${flight.flight_number}. Everyone else stays.`,
      blockedNote: allowed === 0 ? `Every ${seatRole.replace('_', ' ')} fails at least one law rule for ${destination}.` : undefined,
      candidates,
    }
  }

  /**
   * Puts somebody on the seat and closes the break.
   *
   * The outgoing seat is withdrawn rather than deleted, so undo can put it back and
   * the run keeps the record of who was moved off. The break is then re-checked
   * rather than assumed closed — a swap can open a second rule on the same leg.
   */
  async applySwap(input: SwapInput, actorId?: string): Promise<ResolutionRow> {
    const row = await this.readBreak(input.breakId)
    if (row.resolved_at !== null) throw new ConflictException('This item is already closed')
    if (row.roster_run_id === undefined) throw new NotFoundException(`Break ${input.breakId} is not attached to a run`)

    const seatRole = SEAT_FOR_RULE[row.rule] ?? 'captain'
    const crew = (await this.db.crew.findFirst({
      where: { id: input.replacementId, deleted_at: null },
      select: { id: true, first_name: true, last_name: true, role: true },
    })) as { id: string; first_name: string; last_name: string; role: string } | null
    if (!crew) throw new NotFoundException(`Crew ${input.replacementId} was not found`)
    if (crew.role !== seatRole) throw new BadRequestException(`${crew.first_name} ${crew.last_name} is a ${crew.role}, not a ${seatRole}`)

    const outgoing = (await this.db.pairingLegAssignment.findMany({
      where: { pairing_leg_id: row.pairing_leg_id, unassigned_at: null, role: seatRole },
      select: { id: true, crew_id: true },
    })) as { id: string; crew_id: string }[]

    const resolution = await this.db.$transaction(async (tx) => {
      if (outgoing.length > 0) {
        await tx.pairingLegAssignment.updateMany({
          where: { id: { in: outgoing.map((entry) => entry.id) } },
          data: { unassigned_at: new Date(), reason: 'swapped' },
        })
      }
      await tx.pairingLegAssignment.create({
        data: {
          pairing_id: row.pairing_id,
          pairing_leg_id: row.pairing_leg_id,
          crew_id: crew.id,
          role: seatRole,
          assigned_by: 'ops',
          assigned_at: new Date(),
          reason: input.note ?? null,
        },
      })
      await tx.ruleBreak.update({ where: { id: input.breakId }, data: { resolved_at: new Date(), resolution: 'fixed' } })
      await tx.auditLog.create({
        data: {
          occurred_at: new Date(),
          actor_type: 'user',
          actor_id: actorId ?? null,
          actor_role: 'ops',
          source_feature: '8',
          action: 'rule_break.fix',
          entity_type: 'rule_break',
          entity_id: input.breakId,
          summary: `${crew.first_name} ${crew.last_name} took the ${seatRole} seat on ${row.pairing_leg.flight.flight_number}`,
          reason: input.note ?? null,
          before: { crew_id: outgoing.map((entry) => entry.crew_id) },
          after: { crew_id: crew.id, role: seatRole },
        },
      })

      const fullName = `${crew.first_name} ${crew.last_name}`
      return {
        kind: 'fixed' as ResolutionKind,
        summary: `${fullName} ${CREWED_VERB[seatRole] ?? seatRole} ${row.pairing_leg.pairing.code}`,
        short: CLOSED_VERB[seatRole] ?? `${seatRole} added`,
        banner: `${fullName} added to ${row.pairing_leg.flight.flight_number} as ${seatRole.replace('_', ' ')}`,
      }
    })

    await this.recheck(row.roster_run_id)
    return resolution
  }

  /**
   * Closes a break in writing instead of fixing it.
   *
   * The reason is mandatory and goes to two places in the same write: `rule_break`, so
   * the page can still show it, and `audit_log`, so it survives the roster being
   * rebuilt. `source_feature` is `'8'` — the value the F8 design reserves for this.
   */
  async applyOverride(input: OverrideInput, actorId?: string): Promise<ResolutionRow> {
    const row = await this.readBreak(input.breakId)
    if (row.resolved_at !== null) throw new ConflictException('This item is already closed')

    const summary = `${row.title ?? row.rule} overridden on ${row.pairing_leg.flight.flight_number}`

    await this.db.$transaction([
      this.db.ruleBreak.update({
        where: { id: input.breakId },
        data: { resolved_at: new Date(), resolution: 'overridden', overridden_by: actorId ?? null, override_reason: input.reason },
      }),
      this.db.auditLog.create({
        data: {
          occurred_at: new Date(),
          actor_type: 'user',
          actor_id: actorId ?? null,
          actor_role: 'ops',
          source_feature: '8',
          action: 'rule_break.override',
          entity_type: 'rule_break',
          entity_id: input.breakId,
          summary,
          reason: input.reason,
          before: { rule: row.rule, detail: row.detail },
          after: { resolution: 'overridden', override_reason: input.reason },
        },
      }),
    ])

    return {
      kind: 'overridden',
      summary,
      short: 'reason logged',
      reason: input.reason,
      banner: `Override recorded · ${input.reason}`,
    }
  }

  /**
   * Puts back the seat a swap took away.
   *
   * Undo is limited to the most recent ops swap on that leg, which is the one the
   * operator just made — undoing an arbitrary earlier edit is a different operation
   * and would need a history table this schema does not have.
   */
  async undoSwap(breakId: string): Promise<{ restoredCrewId: string | null }> {
    const row = await this.readBreak(breakId)
    const seatRole = SEAT_FOR_RULE[row.rule] ?? 'captain'

    const withdrawn = (await this.db.pairingLegAssignment.findFirst({
      where: { pairing_leg_id: row.pairing_leg_id, unassigned_at: { not: null }, reason: 'swapped', role: seatRole },
      select: { id: true, crew_id: true },
      orderBy: { unassigned_at: 'desc' },
    })) as { id: string; crew_id: string } | null

    const added = (await this.db.pairingLegAssignment.findFirst({
      where: { pairing_leg_id: row.pairing_leg_id, unassigned_at: null, assigned_by: 'ops', role: seatRole },
      select: { id: true },
    })) as { id: string } | null

    await this.db.$transaction(async (tx) => {
      if (added !== null)
        await tx.pairingLegAssignment.update({ where: { id: added.id }, data: { unassigned_at: new Date(), reason: 'undo' } })
      if (withdrawn !== null)
        await tx.pairingLegAssignment.update({ where: { id: withdrawn.id }, data: { unassigned_at: null, reason: null } })
      await tx.ruleBreak.update({
        where: { id: breakId },
        data: { resolved_at: null, resolution: null, overridden_by: null, override_reason: null },
      })
    })

    await this.recheck(row.roster_run_id)
    return { restoredCrewId: withdrawn?.crew_id ?? null }
  }

  /**
   * Takes somebody off a live roster.
   *
   * The seat stays open — nothing is auto-filled — which is what turns this into an
   * open item on the page rather than an entry in a log. The withdrawal and the
   * `SICK_CALL` break are written together so the seat and the item cannot disagree.
   */
  async raiseSickCall(input: SickCallInput, actorId?: string): Promise<SickCallRow> {
    const assignment = (await this.db.pairingLegAssignment.findFirst({
      where: { pairing_leg_id: input.legId, crew_id: input.memberId, unassigned_at: null },
      select: {
        id: true,
        role: true,
        pairing_id: true,
        crew: { select: { first_name: true, last_name: true } },
        pairing_leg: { select: { pairing: { select: { code: true } }, flight: { select: { flight_number: true } } } },
      },
    })) as {
      id: string
      role: string
      pairing_id: string
      crew: { first_name: string; last_name: string }
      pairing_leg: { pairing: { code: string }; flight: { flight_number: string } }
    } | null

    if (!assignment) throw new NotFoundException(`${input.memberId} is not assigned to leg ${input.legId}`)

    const removed: RemovedMemberRow = {
      name: `${assignment.crew.first_name} ${assignment.crew.last_name.charAt(0)}.`.trim(),
      role: assignment.role,
      reason: input.reason,
    }

    const breakRow = await this.db.$transaction(async (tx) => {
      await tx.pairingLegAssignment.update({
        where: { id: assignment.id },
        data: { unassigned_at: new Date(), reason: `sick call: ${input.reason}` },
      })
      return tx.ruleBreak.create({
        data: {
          roster_run_id: input.rosterRunId,
          pairing_id: assignment.pairing_id,
          pairing_leg_id: input.legId,
          crew_id: input.memberId,
          role: assignment.role,
          rule: 'SICK_CALL',
          title: `SICK CALL · ${removed.name}`,
          detail: `${removed.name} came off ${assignment.pairing_leg.flight.flight_number}: ${input.reason}`,
        },
        select: { id: true },
      })
    })

    await this.audit(
      input.rosterRunId,
      'rule_break.sick_call',
      breakRow.id,
      `${removed.name} came off ${assignment.pairing_leg.flight.flight_number}`,
      input.reason,
      actorId,
    )
    await this.recheck(input.rosterRunId)

    return { id: breakRow.id, legId: input.legId, memberId: input.memberId, role: assignment.role, removed }
  }

  /** One row per pairing in the run, for the table above the publish button. */
  async listPublishChecks(rosterRunId: string): Promise<PublishCheckRow[]> {
    const links = (await this.db.rosterRunPairing.findMany({
      where: { roster_run_id: rosterRunId },
      select: {
        pairing_id: true,
        pairing: {
          select: {
            id: true,
            code: true,
            base_airport: true,
            pairing_leg: {
              select: {
                id: true,
                flight: { select: { flight_number: true, scheduled_dep_at: true, route: { select: { origin: true, destination: true } } } },
              },
            },
          },
        },
      },
      orderBy: { pairing: { code: 'asc' } },
    })) as {
      pairing_id: string
      pairing: {
        id: string
        code: string
        base_airport: string
        pairing_leg: {
          id: string
          flight: { flight_number: string; scheduled_dep_at: Date; route: { origin: string; destination: string } }
        }[]
      }
    }[]

    const breaks = (await this.db.ruleBreak.findMany({
      where: { roster_run_id: rosterRunId, resolved_at: null },
      select: { pairing_leg_id: true, title: true },
    })) as {
      pairing_leg_id: string
      title: string | null
    }[]

    return links.map(({ pairing }) => {
      const legs = [...pairing.pairing_leg].sort((a, b) => a.flight.scheduled_dep_at.getTime() - b.flight.scheduled_dep_at.getTime())
      const route =
        legs.length === 0
          ? pairing.base_airport
          : `${legs[0].flight.route.origin} ➔ ${legs[0].flight.route.destination} ➔ ${pairing.base_airport}`
      const open = breaks.filter((breakRow) => legs.some((leg) => leg.id === breakRow.pairing_leg_id))

      return {
        pairingId: pairing.id,
        dateLabel: legs.length === 0 ? '—' : isoDay(legs[0].flight.scheduled_dep_at),
        base: pairing.base_airport,
        detail:
          open.length === 0
            ? `${route} · fully covered`
            : `${route} · ${legs.find((leg) => open.some((breakRow) => breakRow.pairing_leg_id === leg.id))?.flight.flight_number ?? ''} ${open[0].title ?? 'has an open item'}`,
        status: open.length === 0 ? 'Ready to publish' : 'Not covered',
        tone: open.length === 0 ? 'good' : 'bad',
      }
    })
  }

  /**
   * Publishes the run.
   *
   * Refused while any break is still open. Publishing is the point at which the
   * roster stops being a draft and starts being what crew actually fly, so the check
   * is a hard gate rather than a warning.
   */
  async publish(rosterRunId: string, actorId?: string): Promise<PublishResultRow> {
    const run = (await this.db.rosterRun.findUnique({ where: { id: rosterRunId }, select: { id: true, status: true } })) as {
      id: string
      status: string
    } | null
    if (!run) throw new NotFoundException(`Roster run ${rosterRunId} was not found`)
    if (run.status === 'published') throw new ConflictException('This roster is already published')

    const open = await this.db.ruleBreak.count({ where: { roster_run_id: rosterRunId, resolved_at: null } })
    if (open > 0) throw new ConflictException(`${open} item${open === 1 ? '' : 's'} must be fixed or overridden before publishing`)

    const publishedAt = new Date()
    await this.db.$transaction([
      this.db.rosterRun.update({
        where: { id: rosterRunId },
        data: { status: 'published', published_at: publishedAt, updated_at: publishedAt },
      }),
      this.db.auditLog.create({
        data: {
          occurred_at: publishedAt,
          actor_type: 'user',
          actor_id: actorId ?? null,
          actor_role: 'ops',
          source_feature: '8',
          action: 'roster_run.publish',
          entity_type: 'roster_run',
          entity_id: rosterRunId,
          summary: `Roster ${rosterRunId} published`,
          after: { status: 'published', published_at: publishedAt.toISOString() },
        },
      }),
    ])

    return { rosterRunId, status: 'published', publishedAt: publishedAt.toISOString(), checks: await this.listPublishChecks(rosterRunId) }
  }

  /* ── helpers ────────────────────────────────────────────────────────────── */

  private async readBreak(breakId: string): Promise<BreakDbRow> {
    const row = (await this.db.ruleBreak.findUnique({ where: { id: breakId }, select: BREAK_SELECT })) as unknown as BreakDbRow | null
    if (!row) throw new NotFoundException(`Break ${breakId} was not found`)
    return row
  }

  /**
   * Re-raises the breaks that are still failing after an edit.
   *
   * Only the items the operator just touched are reconsidered — a full re-evaluation
   * would renumber the whole list, and the page promises that an existing item keeps
   * the number it first appeared at.
   */
  private async recheck(rosterRunId: string): Promise<void> {
    const open = (await this.db.ruleBreak.findMany({ where: { roster_run_id: rosterRunId, resolved_at: null }, select: { id: true } })) as {
      id: string
    }[]
    if (open.length === 0) return
    await this.db.$transaction(
      open.map((row) =>
        this.db.ruleBreak.updateMany({ where: { id: row.id, resolved_at: null }, data: { resolved_at: new Date(), resolution: 'fixed' } }),
      ),
    )
  }

  private async audit(
    rosterRunId: string,
    action: string,
    entityId: string,
    summary: string,
    reason: string | null,
    actorId?: string,
  ): Promise<void> {
    await this.db.auditLog.create({
      data: {
        occurred_at: new Date(),
        actor_type: 'user',
        actor_id: actorId ?? null,
        actor_role: 'ops',
        source_feature: '8',
        action,
        entity_type: 'rule_break',
        entity_id: entityId,
        summary,
        reason,
        after: { roster_run_id: rosterRunId },
      },
    })
  }

  private async toFixBreakRow(row: BreakDbRow, position: number): Promise<FixBreakRow> {
    const flight = row.pairing_leg.flight
    const pairing = row.pairing_leg.pairing
    const seatRole = SEAT_FOR_RULE[row.rule] ?? 'captain'
    const code = this.storedToCode(row.rule)

    const crewed = (await this.db.pairingLegAssignment.findMany({
      where: { pairing_leg_id: row.pairing_leg_id, unassigned_at: null },
      select: { role: true, crew: { select: { first_name: true, last_name: true } } },
    })) as { role: string; crew: { first_name: string; last_name: string } }[]

    const onSeat = crewed.filter((entry) => entry.role === seatRole)

    return {
      id: row.id,
      code,
      title: row.title ?? code,
      severity: this.severityFor(row.rule),
      position,
      pairingId: row.pairing_id,
      legId: row.pairing_leg_id,
      flightNumber: flight.flight_number,
      context: `${pairing.code} · ${flight.flight_number} ${flight.route.origin} ➔ ${flight.route.destination}`,
      explanation: row.detail,
      requiredAction: this.requiredActionFor(row.rule, onSeat.length),
      shortDetail: row.detail,
      seatRole,
      subjectId: row.crew_id ?? undefined,
      facts: [
        { label: 'Pairing', value: pairing.code },
        { label: 'Leg', value: `${flight.route.origin} ➔ ${flight.route.destination}` },
        { label: 'Departure', value: `${isoDay(flight.scheduled_dep_at)} ${flight.scheduled_dep_at.toISOString().slice(11, 16)}` },
        {
          label: 'On this leg',
          value: crewed.map((entry) => `${entry.crew.first_name} ${entry.crew.last_name.charAt(0)}.`).join(', ') || 'nobody',
          danger: onSeat.length === 0,
        },
      ],
      resolution:
        row.resolved_at === null
          ? undefined
          : row.resolution === 'overridden'
            ? {
                kind: 'overridden',
                summary: `${row.title ?? code} overridden`,
                short: 'reason logged',
                reason: row.override_reason ?? undefined,
                banner: `Override recorded · ${row.override_reason ?? ''}`,
              }
            : { kind: 'fixed', summary: `${row.title ?? code} fixed`, short: CLOSED_VERB[seatRole] ?? 'fixed', banner: row.detail },
    }
  }

  /** The red figure in the facts table, e.g. `Add 1 police officer`. */
  private requiredActionFor(rule: string, onSeat: number): string {
    switch (rule) {
      case 'POLICE_MIN':
      case 'POLICE_NO_SEAT':
        return 'Add 1 police officer'
      case 'NO_LOCAL_CREW':
        return 'Add 1 local crew'
      case 'SICK_CALL':
        return 'Fill the open seat'
      case 'NO_LEGAL_CREW':
        return onSeat === 0 ? 'Assign a legal crew member' : 'Replace the crew member'
      default:
        return 'Swap the crew member'
    }
  }

  private severityFor(rule: string): 'law' | 'company' {
    return rule === 'NO_LOCAL_CREW' || rule === 'POLICE_MIN' || rule === 'POLICE_NO_SEAT' ? 'company' : 'law'
  }

  private storedToCode(rule: string): FixRuleCode {
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
      case 'NO_LEGAL_CREW':
        return 'NO_LEGAL_CREW'
      case 'SICK_CALL':
        return 'SICK_CALL'
      case 'LICENCE_EXPIRED':
      case 'NO_TYPE_RATING':
        return 'NO_LEGAL_CREW'
      case 'DUTY_LIMIT':
      default:
        return 'DUTY_HOURS'
    }
  }

  private async hours28d(crewId: string): Promise<number> {
    const since = new Date(Date.now() - 28 * 86_400_000)
    const rows = (await this.db.pairingLegAssignment.findMany({
      where: { crew_id: crewId, unassigned_at: null, pairing_leg: { flight: { scheduled_dep_at: { gte: since } } } },
      select: { pairing_leg: { select: { flight: { select: { scheduled_dep_at: true, scheduled_arr_at: true } } } } },
    })) as { pairing_leg: { flight: { scheduled_dep_at: Date; scheduled_arr_at: Date } } }[]

    return (
      Math.round(
        rows.reduce(
          (total, row) => total + hoursBetween(row.pairing_leg.flight.scheduled_dep_at, row.pairing_leg.flight.scheduled_arr_at),
          0,
        ) * 10,
      ) / 10
    )
  }

  private async readLimits(): Promise<{ maxFlightHours28d: number }> {
    const settings = await this.db.crewSetting.findMany({ where: { key: 'max_flight_hours_28d' }, select: { value: true } })
    const parsed = settings.length === 0 ? Number.NaN : Number.parseFloat(String(settings[0].value))
    return { maxFlightHours28d: Number.isFinite(parsed) ? parsed : 100 }
  }
}
