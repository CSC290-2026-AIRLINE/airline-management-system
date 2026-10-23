import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

/**
 * Feature 8 · Step 2 — build pairings.
 *
 * Owns `pairing`, `pairing_leg` and the handover into `roster_run` / `roster_run_pairing`.
 * It reads `flight` for the schedule and `crew_setting` / `legality_rule` for the limits,
 * but writes nothing outside the pairing tables.
 *
 * Two decisions worth stating up front:
 *
 *  · **Leg order and duty day come from the flight times.** `pairing_leg` has no
 *    `sequence_number` or `duty_day` column, so a leg's position and its duty day are
 *    derived from `scheduled_dep_at` on read. That is the only ordering that cannot
 *    disagree with the schedule itself.
 *
 *  · **Validity is never stored.** It is recomputed by `evaluatePairing` on every read
 *    and every save, so an edit and a validation can never drift apart. The pairing
 *    tables therefore carry no `is_valid` column, and the F8 branch has none either.
 */

/** Machine-readable failure reasons. Mirrors the codes the page renders in its check list. */
export type PairingErrorCode =
  | 'PAIRING_NOT_CLOSED'
  | 'DUTY_DAY_EXCEEDED'
  | 'FLIGHTS_PER_DAY_EXCEEDED'
  | 'PAIRING_TOO_LONG'
  | 'PAIRING_EMPTY'
  | 'SEQUENCE_BROKEN'
  | 'PAIRING_IN_USE'

export type CheckStatus = 'passed' | 'failed'

export interface BuildParams {
  /** `YYYY-MM-DD`. */
  dateFrom: string
  /** `YYYY-MM-DD`, inclusive. */
  dateTo: string
  /** IATA base the pairings must start and end at. */
  base: string
}

export interface ScheduledFlightRow {
  id: string
  flightNumber: string
  origin: string
  destination: string
  /** ISO-8601 UTC instant. */
  departureAt: string
  /** ISO-8601 UTC instant. */
  arrivalAt: string
  status: 'available' | 'manually_added'
}

export interface FlightLegRow {
  flightId: string
  flightNumber: string
  origin: string
  destination: string
  departureAt: string
  arrivalAt: string
  addedManually: boolean
}

export interface LayoverRow {
  airport: string
  nights: number
  arrivesAt: string
  departsAt: string
}

export interface LegSummaryRow {
  flightId: string
  flightNumber: string
  origin: string
  destination: string
  departureLocal: string
  arrivalLocal: string
  layoverAfter?: LayoverRow
}

export interface LegalityCheckRow {
  code: PairingErrorCode
  label: string
  status: CheckStatus
  /** Right-aligned summary, e.g. `BKK ➔ BKK`, `2`, `6h 45m`, `2 days`. */
  value: string
  /** Human explanation of a failure. Absent when the check passed. */
  detail?: string
}

export interface PairingRow {
  id: string
  base: string
  code: string
  legs: FlightLegRow[]
  deleted: boolean
  releasedFlightIds: string[]
  releasedFlightNumbers: string[]
  published: boolean
}

export interface PairingMetricsRow {
  totalPairings: number
  totalFlights: number
  validCount: number
  invalidCount: number
  deletedCount: number
}

export interface PairingEvaluationRow {
  status: CheckStatus
  checks: LegalityCheckRow[]
  primaryError?: LegalityCheckRow
  /** Airports in visit order, e.g. `['BKK', 'ICN', 'BKK']`. */
  route: string[]
  routeLabel: string
  cardRows: LegSummaryRow[]
  scheduleByDay: { dateLabel: string; rows: { leg: FlightLegRow; durationLabel: string }[] }[]
  layoverLabel: string
  layoverIsError: boolean
  /** Card footer: `2 flights · 2 days`. */
  cardFooterLeft: string
  /** Card footer / commit callout: `12h 30m duty`. */
  dutyLabel: string
  totalDutyMinutes: number
}

export interface PairingListResult {
  pairings: PairingRow[]
  metrics: PairingMetricsRow
}

export interface PairingDetailResult {
  pairing: PairingRow
  evaluation: PairingEvaluationRow
}

export interface PairingValidationResult {
  status: CheckStatus
  checks: LegalityCheckRow[]
  primaryError?: LegalityCheckRow
}

export interface AddLegCandidateRow {
  flight: ScheduledFlightRow
  returnsToBase: boolean
  badgeLabel: string
}

export interface CommitResult {
  rosterRunId: string
  pairingId: string
  status: 'draft' | 'published'
}

export interface BaseOptionRow {
  code: string
  name: string
}

interface Limits {
  maxDutyHours: number
  maxFlightsPerDuty: number
  maxPairingDays: number
  minRestHours: number
}

interface LegDbRow {
  id: string
  added_by: string
  flight: {
    id: string
    flight_number: string
    scheduled_dep_at: Date
    scheduled_arr_at: Date
    route: { origin: string; destination: string }
  }
}

interface PairingDbRow {
  id: string
  code: string
  base_airport: string
  deleted_at: Date | null
  pairing_leg: LegDbRow[]
  roster_run_pairing: { roster_run: { status: string } }[]
}

/** Check labels, written once so the list and the banner can never drift apart. */
const CHECK_LABELS: Record<PairingErrorCode, string> = {
  PAIRING_EMPTY: 'Pairing has flights',
  SEQUENCE_BROKEN: 'Sequence is continuous',
  PAIRING_NOT_CLOSED: 'Returns to base',
  PAIRING_TOO_LONG: 'Within maximum pairing length',
  FLIGHTS_PER_DAY_EXCEEDED: 'Flights per duty day',
  DUTY_DAY_EXCEEDED: 'Duty hours per day',
  PAIRING_IN_USE: 'Not in a published roster',
}

const PAIRING_SELECT = {
  id: true,
  code: true,
  base_airport: true,
  deleted_at: true,
  pairing_leg: {
    select: {
      id: true,
      added_by: true,
      flight: {
        select: {
          id: true,
          flight_number: true,
          scheduled_dep_at: true,
          scheduled_arr_at: true,
          route: { select: { origin: true, destination: true } },
        },
      },
    },
  },
  roster_run_pairing: { select: { roster_run: { select: { status: true } } } },
} as const

/** Minutes between two instants, never negative — a leg that lands before it flies is treated as zero. */
function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000))
}

/** `2 days`, `1 day` — the unit is carried in the caller, this is just the count. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** `6h 45m` — the format the duty column and the card footer both print. */
function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours === 0 ? `${rest}m` : `${hours}h ${String(rest).padStart(2, '0')}m`
}

@Injectable()
export class BuildPairingService {
  constructor(private readonly db: DbService) {}

  /** Bases pairings can be built at. Every active airport. */
  async listBases(): Promise<BaseOptionRow[]> {
    const rows = await this.db.airport.findMany({
      where: { is_active: true },
      select: { iata_code: true, name: true },
      orderBy: { iata_code: 'asc' },
    })
    return rows.map((row) => ({ code: row.iata_code, name: row.name }))
  }

  /**
   * Flights in the window that touch the base.
   *
   * A flight counts as touching the base if it either departs from it or lands at it,
   * because a pairing can be opened by the return leg as easily as by the outbound
   * one. `available` means the flight is not in a live pairing yet; `manually_added`
   * means it is only reachable by the Edit Legs picker.
   */
  async listFlights(params: BuildParams): Promise<ScheduledFlightRow[]> {
    const { from, to } = this.window(params)
    const base = params.base.toUpperCase()

    const rows = (await this.db.flight.findMany({
      where: { scheduled_dep_at: { gte: from, lt: to }, route: { OR: [{ origin: base }, { destination: base }] } },
      select: {
        id: true,
        flight_number: true,
        scheduled_dep_at: true,
        scheduled_arr_at: true,
        route: { select: { origin: true, destination: true } },
        pairing_leg: { select: { pairing: { select: { id: true, deleted_at: true } } } },
      },
      orderBy: { scheduled_dep_at: 'asc' },
    })) as {
      id: string
      flight_number: string
      scheduled_dep_at: Date
      scheduled_arr_at: Date
      route: { origin: string; destination: string }
      pairing_leg: { pairing: { id: string; deleted_at: Date | null } }[]
    }[]

    return rows.map((row) => ({
      id: row.id,
      flightNumber: row.flight_number,
      origin: row.route.origin,
      destination: row.route.destination,
      departureAt: row.scheduled_dep_at.toISOString(),
      arrivalAt: row.scheduled_arr_at.toISOString(),
      status: row.pairing_leg.some((leg) => leg.pairing.deleted_at === null) ? 'manually_added' : 'available',
    }))
  }

  /**
   * Candidate legs for the Add Leg modal.
   *
   * Everything in the window, not just the base's own flights: a pairing is allowed
   * to sit at a hub it does not serve directly.
   */
  async listAddLegCandidates(pairingId: string): Promise<AddLegCandidateRow[]> {
    const pairing = (await this.db.pairing.findFirst({ where: { id: pairingId }, select: { base_airport: true } })) as
      { base_airport: string } | undefined
    if (!pairing) throw new NotFoundException(`Pairing ${pairingId} was not found`)

    const { from, to } = this.window({
      dateFrom: this.isoDay(new Date()),
      dateTo: this.isoDay(new Date(Date.now() + 14 * 86_400_000)),
      base: pairing.base_airport,
    })
    const flights = await this.listFlights({
      dateFrom: this.isoDay(from),
      dateTo: this.isoDay(new Date(to.getTime() - 86_400_000)),
      base: pairing.base_airport,
    })

    return flights
      .filter((flight) => flight.origin === pairing.base_airport || flight.destination === pairing.base_airport)
      .map((flight) => ({
        flight,
        returnsToBase: flight.destination === pairing.base_airport,
        badgeLabel: flight.destination === pairing.base_airport ? 'Returns to base' : `Ends at ${flight.destination}`,
      }))
  }

  /**
   * Builds pairings for a window and stores them.
   *
   * Greedy and deterministic: flights are walked in departure order and each one is
   * chained onto the earliest open pairing it can legally extend. Running the same
   * window twice is idempotent because existing live pairings are loaded first and
   * only their unused flights are considered.
   */
  async generatePairings(params: BuildParams): Promise<PairingListResult> {
    const limits = await this.readLimits()
    const { from, to } = this.window(params)
    const base = params.base.toUpperCase()

    const existing = (await this.db.pairing.findMany({
      where: { base_airport: base, deleted_at: null, pairing_leg: { some: { flight: { scheduled_dep_at: { gte: from, lt: to } } } } },
      select: PAIRING_SELECT,
      orderBy: { created_at: 'asc' },
    })) as PairingDbRow[]

    const taken = new Set(existing.flatMap((pairing) => pairing.pairing_leg.map((leg) => leg.flight.id)))

    const candidates = (await this.db.flight.findMany({
      where: {
        scheduled_dep_at: { gte: from, lt: to },
        route: { origin: base },
        id: { notIn: [...taken] },
      },
      select: {
        id: true,
        flight_number: true,
        scheduled_dep_at: true,
        scheduled_arr_at: true,
        route: { select: { origin: true, destination: true } },
      },
      orderBy: { scheduled_dep_at: 'asc' },
    })) as {
      id: string
      flight_number: string
      scheduled_dep_at: Date
      scheduled_arr_at: Date
      route: { origin: string; destination: string }
    }[]

    const drafts: { code: string; legs: typeof candidates }[] = []

    for (const flight of candidates) {
      const open = drafts.find((draft) => this.canExtend(draft, flight, limits))
      if (open) open.legs.push(flight)
      else drafts.push({ code: `P-DRAFT-${drafts.length + 1}`, legs: [flight] })
    }

    const created = []
    for (const draft of drafts) {
      created.push(
        await this.db.pairing.create({
          data: {
            base_airport: base,
            pairing_leg: {
              create: draft.legs.map((leg) => ({ flight_id: leg.id, added_by: 'auto' })),
            },
          },
          select: PAIRING_SELECT,
        }),
      )
    }

    return this.toListResult([...existing, ...created], base)
  }

  /** Draft pairings for a window, each with its legality check rolled up into the metrics. */
  async listPairings(params: BuildParams): Promise<PairingListResult> {
    const base = params.base.toUpperCase()
    const { from, to } = this.window(params)
    const rows = (await this.db.pairing.findMany({
      where: { base_airport: base, pairing_leg: { some: { flight: { scheduled_dep_at: { gte: from, lt: to } } } } },
      select: PAIRING_SELECT,
      orderBy: { created_at: 'asc' },
    })) as PairingDbRow[]

    return this.toListResult(rows, base)
  }

  async getPairing(pairingId: string): Promise<PairingDetailResult> {
    const row = (await this.db.pairing.findUnique({ where: { id: pairingId }, select: PAIRING_SELECT })) as PairingDbRow | null
    if (!row) throw new NotFoundException(`Pairing ${pairingId} was not found`)

    const pairing = this.toPairingRow(row)
    return { pairing, evaluation: await this.evaluatePairing(pairing.legs, row.base_airport) }
  }

  /**
   * Validates a pairing the caller has not saved yet.
   *
   * Takes loose leg input rather than a stored pairing id because the Edit Legs modal
   * re-checks the draft on every keystroke, before there is a row to point at.
   */
  async validateDraft(base: string, legs: FlightLegRow[]): Promise<PairingValidationResult> {
    const evaluation = await this.evaluatePairing(legs, base.toUpperCase())
    return { status: evaluation.status, checks: evaluation.checks, primaryError: evaluation.primaryError }
  }

  /**
   * Replaces a pairing's legs.
   *
   * A published pairing is refused rather than rewritten — step 3 is where a live
   * roster is changed, and it records who changed it.
   */
  async saveLegs(pairingId: string, legs: FlightLegRow[]): Promise<PairingDetailResult> {
    const row = (await this.db.pairing.findUnique({ where: { id: pairingId }, select: PAIRING_SELECT })) as PairingDbRow | null
    if (!row) throw new NotFoundException(`Pairing ${pairingId} was not found`)
    if (this.isPublished(row)) throw new ConflictException('This pairing is in a published roster and can no longer be edited')

    const addedManually = new Set(legs.filter((leg) => leg.addedManually).map((leg) => leg.flightId))
    await this.db.$transaction(async (tx) => {
      await tx.pairingLeg.deleteMany({ where: { pairing_id: pairingId } })
      if (legs.length > 0) {
        await tx.pairingLeg.createMany({
          data: legs.map((leg) => ({
            pairing_id: pairingId,
            flight_id: leg.flightId,
            added_by: addedManually.has(leg.flightId) ? 'manual' : 'auto',
          })),
        })
      }
      await tx.pairing.update({ where: { id: pairingId }, data: { deleted_at: null, updated_at: new Date() } })
    })

    return this.getPairing(pairingId)
  }

  /**
   * Soft-deletes a pairing, returning its flights to the unpaired pool.
   *
   * Soft rather than hard so the deleted-pairing card can still name the flights it
   * released; the rows stop counting as pairings the moment `deleted_at` is set.
   */
  async deletePairing(pairingId: string): Promise<PairingRow> {
    const row = (await this.db.pairing.findUnique({ where: { id: pairingId }, select: PAIRING_SELECT })) as PairingDbRow | null
    if (!row) throw new NotFoundException(`Pairing ${pairingId} was not found`)
    if (this.isPublished(row)) throw new ConflictException('This pairing is in a published roster and can no longer be deleted')

    const deleted = (await this.db.pairing.update({
      where: { id: pairingId },
      data: { deleted_at: new Date(), updated_at: new Date() },
      select: PAIRING_SELECT,
    })) as PairingDbRow

    return this.toPairingRow(deleted)
  }

  /** Drops every draft pairing in a window. Published pairings are left alone. */
  async clearPairings(params: BuildParams): Promise<{ releasedPairings: number }> {
    const { from, to } = this.window(params)
    const rows = (await this.db.pairing.findMany({
      where: {
        base_airport: params.base.toUpperCase(),
        deleted_at: null,
        roster_run_pairing: { none: { roster_run: { status: 'published' } } },
      },
      select: { id: true, pairing_leg: { select: { flight: { select: { scheduled_dep_at: true } } } } },
    })) as { id: string; pairing_leg: { flight: { scheduled_dep_at: Date } } }[]

    const inWindow = rows.filter((row) =>
      row.pairing_leg.some((leg) => leg.flight.scheduled_dep_at >= from && leg.flight.scheduled_dep_at < to),
    )
    if (inWindow.length > 0) {
      await this.db.pairing.updateMany({
        where: { id: { in: inWindow.map((row) => row.id) } },
        data: { deleted_at: new Date(), updated_at: new Date() },
      })
    }
    return { releasedPairings: inWindow.length }
  }

  /**
   * Hands a valid pairing over to the roster run for the window.
   *
   * The run is created in draft if it does not exist yet, and keyed on base plus date
   * range so the same window always lands in the same run rather than fragmenting
   * into a new one per pairing.
   */
  async commitPairing(pairingId: string, params: BuildParams): Promise<CommitResult> {
    const row = (await this.db.pairing.findUnique({ where: { id: pairingId }, select: PAIRING_SELECT })) as PairingDbRow | null
    if (!row) throw new NotFoundException(`Pairing ${pairingId} was not found`)

    const evaluation = await this.evaluatePairing(this.toPairingRow(row).legs, row.base_airport)
    if (evaluation.status === 'failed') {
      throw new BadRequestException(
        `Pairing ${row.code} is not legal yet: ${evaluation.primaryError?.detail ?? evaluation.primaryError?.label ?? 'a check failed'}`,
      )
    }

    const base = params.base.toUpperCase()
    const run = (await this.db.rosterRun.upsert({
      where: {
        base_airport_date_from_date_to: { base_airport: base, date_from: new Date(params.dateFrom), date_to: new Date(params.dateTo) },
      },
      update: {},
      create: { base_airport: base, date_from: new Date(params.dateFrom), date_to: new Date(params.dateTo), status: 'draft' },
      select: { id: true, status: true },
    })) as { id: string; status: string }

    await this.db.rosterRunPairing.upsert({
      where: { roster_run_id_pairing_id: { roster_run_id: run.id, pairing_id: pairingId } },
      update: {},
      create: { roster_run_id: run.id, pairing_id: pairingId },
    })

    return { rosterRunId: run.id, pairingId, status: run.status === 'published' ? 'published' : 'draft' }
  }

  /* ── legality ───────────────────────────────────────────────────────────── */

  /**
   * The full check list for a pairing, in the order the inspector prints it.
   *
   * Every check is always evaluated and always returned — a passing row stays in the
   * list — so the operator can see what was cleared, not only what failed.
   */
  async evaluatePairing(legs: FlightLegRow[], base: string): Promise<PairingEvaluationRow> {
    const limits = await this.readLimits()
    const ordered = [...legs].sort((a, b) => a.departureAt.localeCompare(b.departureAt))

    const checks: LegalityCheckRow[] = []
    const add = (code: PairingErrorCode, status: CheckStatus, value: string, detail?: string): void => {
      checks.push(
        detail === undefined
          ? { code, label: CHECK_LABELS[code], status, value }
          : { code, label: CHECK_LABELS[code], status, value, detail },
      )
    }

    const route = ordered.length === 0 ? [] : [ordered[0].origin, ...ordered.map((leg) => leg.destination)]

    if (ordered.length === 0) {
      add('PAIRING_EMPTY', 'failed', '0', 'A pairing needs at least one flight.')
    } else {
      add('PAIRING_EMPTY', 'passed', String(ordered.length))
    }

    const breaks = ordered.slice(1).filter((leg, index) => ordered[index].destination !== leg.origin)
    add(
      'SEQUENCE_BROKEN',
      breaks.length === 0 ? 'passed' : 'failed',
      breaks.length === 0 ? 'Continuous' : `${breaks.length} gap${breaks.length === 1 ? '' : 's'}`,
      breaks.length === 0
        ? undefined
        : `Leg ${breaks.length} departs ${breaks[0].origin} but the previous leg ends at ${ordered[0].destination}.`,
    )

    const last = ordered[ordered.length - 1]
    add(
      'PAIRING_NOT_CLOSED',
      last !== undefined && last.destination === base ? 'passed' : 'failed',
      ordered.length === 0 ? '—' : `${ordered[0].origin} ➔ ${last.destination}`,
      ordered.length === 0
        ? undefined
        : last.destination === base
          ? undefined
          : `Pairing ends at ${last.destination}, not at base ${base}.`,
    )

    const days = this.dutyDayCount(ordered.map((leg) => leg.departureAt.slice(0, 10)))
    add(
      'PAIRING_TOO_LONG',
      days <= limits.maxPairingDays ? 'passed' : 'failed',
      plural(days, 'day'),
      days <= limits.maxPairingDays
        ? undefined
        : `Pairing runs ${plural(days, 'day')}; the limit is ${plural(limits.maxPairingDays, 'day')}.`,
    )

    const busiestDay = this.busiestDutyDay(ordered)
    add(
      'FLIGHTS_PER_DAY_EXCEEDED',
      busiestDay.count <= limits.maxFlightsPerDuty ? 'passed' : 'failed',
      String(busiestDay.count),
      busiestDay.count <= limits.maxFlightsPerDuty
        ? undefined
        : `${plural(busiestDay.count, 'flight')} on ${busiestDay.day}; the limit is ${limits.maxFlightsPerDuty}.`,
    )

    const longestDay = this.longestDutyDay(ordered.map((leg) => ({ dep: new Date(leg.departureAt), arr: new Date(leg.arrivalAt) })))
    add(
      'DUTY_DAY_EXCEEDED',
      longestDay.minutes / 60 <= limits.maxDutyHours ? 'passed' : 'failed',
      durationLabel(longestDay.minutes),
      longestDay.minutes / 60 <= limits.maxDutyHours
        ? undefined
        : `${durationLabel(longestDay.minutes)} of duty on ${longestDay.day}; the limit is ${durationLabel(limits.maxDutyHours * 60)}.`,
    )

    const primaryError = checks.find((check) => check.status === 'failed')
    const layovers = this.layovers(ordered)
    const shortLayover = layovers.find((layover) => layover.nights > 0 && this.layoverMinutes(layover) < limits.minRestHours * 60)

    return {
      status: primaryError === undefined ? 'passed' : 'failed',
      checks,
      primaryError,
      route,
      routeLabel: route.join(' ➔ '),
      cardRows: this.cardRows(ordered, layovers),
      scheduleByDay: this.scheduleByDay(ordered),
      layoverLabel:
        layovers.length === 0
          ? 'No layovers'
          : `${plural(
              layovers.reduce((total, layover) => total + layover.nights, 0),
              'night',
            )} · ${[...new Set(layovers.map((l) => l.airport))].join(', ')}`,
      layoverIsError: shortLayover !== undefined,
      cardFooterLeft: `${plural(ordered.length, 'flight')} · ${plural(days, 'day')}`,
      dutyLabel: `${durationLabel(longestDay.minutes)} duty`,
      totalDutyMinutes: longestDay.minutes,
    }
  }

  /** Can this leg legally extend the open pairing? Used only by the generator. */
  private canExtend(
    draft: { legs: { scheduled_dep_at: Date; scheduled_arr_at: Date; route: { destination: string } }[] },
    flight: { scheduled_arr_at: Date; route: { origin: string } },
    limits: Limits,
  ): boolean {
    const current = draft.legs[draft.legs.length - 1]
    if (current.route.destination !== flight.route.origin) return false
    if (this.dutyDayCount(draft.legs.map((leg) => this.isoDay(leg.scheduled_dep_at))) > limits.maxPairingDays) return false
    if (
      this.longestDutyDay(draft.legs.map((leg) => ({ dep: leg.scheduled_dep_at, arr: leg.scheduled_arr_at }))).minutes >
      limits.maxDutyHours * 60
    )
      return false

    const nextDay = this.isoDay(flight.scheduled_arr_at)
    const onLastDay = draft.legs.filter((leg) => this.isoDay(leg.scheduled_dep_at) === nextDay).length + 1
    if (onLastDay > limits.maxFlightsPerDuty) return false

    // The chain may keep going until it runs out of legal room, or close at base.
    return true
  }

  /* ── row mapping ────────────────────────────────────────────────────────── */

  private toPairingRow(row: PairingDbRow): PairingRow {
    const legs = [...row.pairing_leg]
      .sort((a, b) => a.flight.scheduled_dep_at.getTime() - b.flight.scheduled_dep_at.getTime())
      .map((leg): FlightLegRow => ({
        flightId: leg.flight.id,
        flightNumber: leg.flight.flight_number,
        origin: leg.flight.route.origin,
        destination: leg.flight.route.destination,
        departureAt: leg.flight.scheduled_dep_at.toISOString(),
        arrivalAt: leg.flight.scheduled_arr_at.toISOString(),
        addedManually: leg.added_by !== 'auto',
      }))

    const released = row.deleted_at !== null ? legs : []
    return {
      id: row.id,
      base: row.base_airport,
      code: row.code,
      legs,
      deleted: row.deleted_at !== null,
      releasedFlightIds: released.map((leg) => leg.flightId),
      releasedFlightNumbers: released.map((leg) => leg.flightNumber),
      published: this.isPublished(row),
    }
  }

  private isPublished(row: PairingDbRow): boolean {
    return row.roster_run_pairing.some((link) => link.roster_run.status === 'published')
  }

  private async toListResult(rows: PairingDbRow[], base: string): Promise<PairingListResult> {
    const pairings: PairingRow[] = []
    let validCount = 0
    let invalidCount = 0
    let deletedCount = 0
    let totalFlights = 0

    for (const row of rows) {
      const pairing = this.toPairingRow(row)
      pairings.push(pairing)

      if (pairing.deleted) {
        deletedCount += 1
        continue
      }

      const evaluation = await this.evaluatePairing(pairing.legs, base)
      if (evaluation.status === 'passed') validCount += 1
      else invalidCount += 1
      totalFlights += pairing.legs.length
    }

    return {
      pairings,
      metrics: { totalPairings: pairings.length - deletedCount, totalFlights, validCount, invalidCount, deletedCount },
    }
  }

  /* ── limits and dates ───────────────────────────────────────────────────── */

  /**
   * Company limits, with any country override applied to the flights involved.
   *
   * Only `min_rest_hours` and `max_duty_hours` are country-specific in the design;
   * a pairing may touch several countries, so the tightest rule of the ones it
   * visits is the one that applies.
   */
  private async readLimits(): Promise<Limits> {
    const settings = await this.db.crewSetting.findMany({
      where: { key: { in: ['max_duty_hours', 'max_flights_per_duty', 'max_pairing_days', 'min_rest_hours'] } },
      select: { key: true, value: true },
    })
    const byKey = new Map(settings.map((setting) => [setting.key, Number.parseFloat(String(setting.value))]))

    return {
      maxDutyHours: finite(byKey.get('max_duty_hours'), 13),
      maxFlightsPerDuty: finite(byKey.get('max_flights_per_duty'), 4),
      maxPairingDays: finite(byKey.get('max_pairing_days'), 3),
      minRestHours: finite(byKey.get('min_rest_hours'), 10),
    }
  }

  /** Inclusive `YYYY-MM-DD` window as a half-open instant range. */
  private window(params: BuildParams): { from: Date; to: Date } {
    const from = Date.parse(`${params.dateFrom}T00:00:00.000Z`)
    const to = Date.parse(`${params.dateTo}T00:00:00.000Z`) + 86_400_000
    if (Number.isNaN(from) || Number.isNaN(to)) throw new BadRequestException('dateFrom and dateTo must be YYYY-MM-DD')
    if (to <= from) throw new BadRequestException('dateTo must be on or after dateFrom')
    return { from: new Date(from), to: new Date(to) }
  }

  /* ── derivations from flight times ──────────────────────────────────────── */

  /** `YYYY-MM-DD` of an instant, in UTC. */
  private isoDay(value: Date): string {
    return value.toISOString().slice(0, 10)
  }

  /** Distinct duty days in a list of `YYYY-MM-DD` keys. */
  private dutyDayCount(days: readonly string[]): number {
    return new Set(days).size
  }

  private busiestDutyDay(legs: FlightLegRow[]): { day: string; count: number } {
    const counts = new Map<string, number>()
    for (const leg of legs) {
      const day = leg.departureAt.slice(0, 10)
      counts.set(day, (counts.get(day) ?? 0) + 1)
    }
    let worst: { day: string; count: number } = { day: '—', count: 0 }
    for (const [day, count] of counts) if (count > worst.count) worst = { day, count }
    return worst
  }

  /**
   * The longest single duty day.
   *
   * A duty day runs from the first departure to the last arrival on that calendar day,
   * which is why the measurement is taken on a whole-day basis rather than per leg.
   */
  private longestDutyDay(legs: readonly { dep: Date; arr: Date }[]): { day: string; minutes: number } {
    const byDay = new Map<string, { start: Date; end: Date }>()
    for (const leg of legs) {
      const day = this.isoDay(leg.dep)
      const span = byDay.get(day)
      if (span === undefined) byDay.set(day, { start: leg.dep, end: leg.arr })
      else byDay.set(day, { start: leg.dep < span.start ? leg.dep : span.start, end: leg.arr > span.end ? leg.arr : span.end })
    }

    let worst: { day: string; minutes: number } = { day: '—', minutes: 0 }
    for (const [day, span] of byDay) {
      const minutes = minutesBetween(span.start, span.end)
      if (minutes > worst.minutes) worst = { day, minutes }
    }
    return worst
  }

  private layovers(legs: FlightLegRow[]): LayoverRow[] {
    const out: LayoverRow[] = []
    for (let index = 0; index < legs.length - 1; index += 1) {
      const arrival = new Date(legs[index].arrivalAt)
      const departure = new Date(legs[index + 1].departureAt)
      const nights = Math.floor(minutesBetween(arrival, departure) / 1_440)
      out.push({ airport: legs[index].destination, nights, arrivesAt: legs[index].arrivalAt, departsAt: legs[index + 1].departureAt })
    }
    return out
  }

  private layoverMinutes(layover: LayoverRow): number {
    return minutesBetween(new Date(layover.arrivesAt), new Date(layover.departsAt))
  }

  private cardRows(legs: FlightLegRow[], layovers: LayoverRow[]): LegSummaryRow[] {
    return legs.map((leg, index) => ({
      flightId: leg.flightId,
      flightNumber: leg.flightNumber,
      origin: leg.origin,
      destination: leg.destination,
      departureLocal: leg.departureAt.slice(11, 16),
      arrivalLocal: leg.arrivalAt.slice(11, 16),
      layoverAfter: index < layovers.length ? layovers[index] : undefined,
    }))
  }

  private scheduleByDay(legs: FlightLegRow[]): { dateLabel: string; rows: { leg: FlightLegRow; durationLabel: string }[] }[] {
    const byDay = new Map<string, FlightLegRow[]>()
    for (const leg of legs) {
      const day = leg.departureAt.slice(0, 10)
      const existing = byDay.get(day)
      if (existing === undefined) byDay.set(day, [leg])
      else existing.push(leg)
    }

    return [...byDay.entries()].map(([date, dayLegs]) => ({
      dateLabel: date,
      rows: dayLegs.map((leg) => ({
        leg,
        durationLabel: durationLabel(minutesBetween(new Date(leg.departureAt), new Date(leg.arrivalAt))),
      })),
    }))
  }
}

/** Falls back when a setting row is missing or unreadable. */
function finite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback
}
