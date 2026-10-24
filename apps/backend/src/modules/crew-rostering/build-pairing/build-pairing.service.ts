import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { Prisma } from '@backend/db/generated/prisma/client'
import { buildChains } from './chain-builder'

/**
 * Feature 8 · Step 2 — build pairings.
 *
 * Owns `pairing`, `pairing_leg` and the handover into `roster_run` / `roster_run_pairing`.
 * It reads `flight` for the schedule and `crew_setting` / `country_legality_rule` for the
 * limits, but writes nothing outside the pairing and run tables.
 *
 * Decisions taken from the F8 migration (`20261024120000_feature8_crew_rostering`):
 *
 *  · **Leg order, duty days and validity are derived, never stored.** They come from
 *    the flights' current `dep_at` / `arr_at`, so a feature 2 delay changes them.
 *  · **A pairing is stored only when it is committed.** Generate proposes pairings without
 *    writing anything, and Commit stores the ones Ops chose and links them to the run. Deleting
 *    a stored pairing is a hard delete (its legs cascade). In a draft run it is first taken out
 *    of the run (rule breaks, assignments, run link); in a published run the answer is
 *    `PAIRING_IN_USE`.
 *  · **Only valid pairings join a run**, and only when every leg is inside the run's dates.
 *    Editing the legs of a pairing in a draft run takes it out of the run, so it has to be
 *    committed again and cannot slip in invalid.
 */

export type PairingErrorCode =
  'PAIRING_EMPTY' | 'SEQUENCE_BROKEN' | 'PAIRING_NOT_CLOSED' | 'FLIGHTS_PER_DAY_EXCEEDED' | 'DUTY_DAY_EXCEEDED' | 'PAIRING_TOO_LONG'

export type CheckStatus = 'passed' | 'failed'

export interface BuildParams {
  /** `YYYY-MM-DD`, compared with `flight.service_date`. */
  dateFrom: string
  /** `YYYY-MM-DD`, inclusive. */
  dateTo: string
  /** IATA base the pairings must start and end at. */
  base: string
}

/** The limits a pairing is checked against, after any stricter destination rule is applied. */
export interface PairingLimitsRow {
  maxFlightsPerDuty: number
  maxDutyHours: number
  maxPairingDays: number
  minRestHours: number
  /** A duty starts this many minutes before its first departure. */
  reportMinutes: number
  /** A duty ends this many minutes after its last arrival. */
  releaseMinutes: number
}

export interface ScheduledFlightRow {
  id: string
  flightNumber: string
  origin: string
  destination: string
  /** ISO-8601 UTC instant, the flight's current departure time. */
  departureAt: string
  /** ISO-8601 UTC instant, the flight's current arrival time. */
  arrivalAt: string
  /** `paired` when the flight is already a leg of a pairing (a flight is in one pairing at most). */
  status: 'available' | 'paired'
  pairingId: string | null
}

export interface FlightLegRow {
  flightId: string
  flightNumber: string
  origin: string
  destination: string
  departureAt: string
  arrivalAt: string
  /** `pairing_leg.added_by = 'ops'`. */
  addedManually: boolean
}

export interface LegalityCheckRow {
  code: PairingErrorCode
  status: CheckStatus
  /** Human explanation of a failure. Absent when the check passed. */
  detail?: string
}

export interface PairingEvaluationRow {
  status: CheckStatus
  checks: LegalityCheckRow[]
}

export interface RosterRunRow {
  id: string
  base: string
  dateFrom: string
  dateTo: string
  status: 'draft' | 'published'
}

export interface PairingRow {
  id: string
  /** What Ops sees, such as `P-101`. */
  code: string
  base: string
  legs: FlightLegRow[]
  rosterRunId: string | null
  rosterRunStatus: 'draft' | 'published' | null
  /** In a published run, so it can no longer be edited or deleted here. */
  published: boolean
  limits: PairingLimitsRow
}

export interface PairingListResult {
  pairings: PairingRow[]
  /** Every flight in the window, for the Add leg picker. */
  flights: ScheduledFlightRow[]
  /** The run for exactly this base and window, if one exists yet. */
  rosterRun: RosterRunRow | null
}

export interface SaveLegInput {
  flightId: string
  addedManually: boolean
}

export interface SaveLegsResult {
  pairing: PairingRow
  /** True when the edit took the pairing out of its draft roster run. */
  withdrawnFromRun: boolean
}

export interface DeletePairingResult {
  id: string
  code: string
  releasedFlightIds: string[]
  releasedFlightNumbers: string[]
}

/** A pairing in the window that was committed earlier, so Generate does not offer its flights again. */
export interface CommittedPairingRow {
  code: string
  rosterRunId: string
  runDateFrom: string
  runDateTo: string
  runStatus: 'draft' | 'published'
}

/**
 * What Generate answers. The pairings are a proposal: nothing about them is stored yet. Their ids
 * and codes are provisional (the code is the one the database will hand out next), and they only
 * become rows when Ops commit them.
 */
export interface GenerateResult extends PairingListResult {
  committed: CommittedPairingRow[]
}

/** One pairing Ops are committing, as the page holds it. `ref` is the code the proposal showed. */
export interface CommitDraft {
  ref: string
  legs: SaveLegInput[]
}

export interface CommitResult {
  rosterRun: RosterRunRow
  /** The pairings this call stored and put in the run, with the code each one was given. */
  committed: { ref: string; code: string }[]
  /** Refs of drafts that failed a legality check, and so were not stored. */
  skippedInvalid: string[]
  /** Refs of valid drafts with a leg outside the run's dates. */
  skippedOutsideWindow: string[]
  /** Refs of drafts with a flight that is already in another pairing. */
  skippedTaken: string[]
}

/** Minimum time between two legs the generator chains together. */
const MIN_CONNECTION_MINUTES = 60

/** Flights that can no longer be flown are never offered or paired. */
const UNPAIRABLE_FLIGHT_STATUSES = ['cancelled']

/** Fallbacks for a missing `crew_setting` row; the migration seeds the same values. */
const DEFAULT_LIMITS: PairingLimitsRow = {
  maxFlightsPerDuty: 4,
  maxDutyHours: 13,
  maxPairingDays: 3,
  minRestHours: 10,
  reportMinutes: 60,
  releaseMinutes: 0,
}

const FLIGHT_SELECT = {
  id: true,
  flight_number: true,
  dep_at: true,
  arr_at: true,
  route: { select: { origin: true, destination: true } },
} satisfies Prisma.flightSelect

const PAIRING_SELECT = {
  id: true,
  code: true,
  base_airport: true,
  pairing_leg: { select: { id: true, added_by: true, flight: { select: { ...FLIGHT_SELECT, service_date: true } } } },
  roster_run_pairing: { select: { roster_run: { select: { id: true, status: true } } } },
} satisfies Prisma.pairingSelect

type FlightDbRow = Prisma.flightGetPayload<{ select: typeof FLIGHT_SELECT }>
type PairingDbRow = Prisma.pairingGetPayload<{ select: typeof PAIRING_SELECT }>

/** Settings, stricter country rules and airport facts, loaded once per request. */
interface LimitsContext {
  defaults: PairingLimitsRow
  countryRules: Map<string, { minRestHours: number; maxDutyHours: number }>
  airportCountry: Map<string, string>
  /** Duty days are cut at local midnight in the base's timezone. */
  timeZone: string
}

@Injectable()
export class BuildPairingService {
  constructor(private readonly db: DbService) {}

  /** Bases pairings can be built at. Every active airport. */
  async listBases(): Promise<{ code: string; name: string }[]> {
    const rows = await this.db.airport.findMany({
      where: { is_active: true },
      select: { iata_code: true, name: true },
      orderBy: { iata_code: 'asc' },
    })
    return rows.map((row) => ({ code: row.iata_code, name: row.name }))
  }

  /** Pairings at the base with a leg in the window, every flight in the window, and the window's run. */
  async listPairings(params: BuildParams): Promise<PairingListResult> {
    const context = await this.loadContext(params.base)
    const window = this.serviceDates(params)

    const [rows, flights, rosterRun] = await Promise.all([
      this.db.pairing.findMany({
        where: { base_airport: params.base, pairing_leg: { some: { flight: { service_date: window } } } },
        select: PAIRING_SELECT,
        orderBy: { created_at: 'asc' },
      }),
      this.db.flight.findMany({
        where: { service_date: window, status: { notIn: UNPAIRABLE_FLIGHT_STATUSES } },
        select: { ...FLIGHT_SELECT, pairing_leg: { select: { pairing_id: true } } },
        orderBy: { dep_at: 'asc' },
      }),
      this.findRun(params),
    ])

    return {
      pairings: rows.map((row) => this.toPairingRow(row, context)),
      flights: flights.map((flight) => ({
        ...this.toFlightFields(flight),
        status: flight.pairing_leg ? 'paired' : 'available',
        pairingId: flight.pairing_leg?.pairing_id ?? null,
      })),
      rosterRun,
    }
  }

  /**
   * Proposes pairings from the window's unpaired flights. Nothing is stored.
   *
   * Every call is a fresh random draw (see `buildChains`): seeds and connections are picked at
   * random, most chains come home to base and some do not. A chain that cannot close is offered
   * anyway, as Invalid, so Ops can repair it by hand before committing. Pairings committed earlier
   * come back too, with their run, and their flights are not offered again.
   *
   * Drafts stored by an earlier version of this step are removed first, since they would hold
   * flights nobody can see. From here on a pairing exists in the database only once it is committed.
   */
  async generatePairings(params: BuildParams): Promise<GenerateResult> {
    const context = await this.loadContext(params.base)
    const window = this.serviceDates(params)
    await this.discardDrafts(params)

    const [flights, rosterRun, committedRows, nextNumber] = await Promise.all([
      this.db.flight.findMany({
        where: { service_date: window, status: { notIn: UNPAIRABLE_FLIGHT_STATUSES } },
        select: { ...FLIGHT_SELECT, pairing_leg: { select: { pairing_id: true } } },
        orderBy: { dep_at: 'asc' },
      }),
      this.findRun(params),
      this.db.pairing.findMany({
        where: {
          base_airport: params.base,
          roster_run_pairing: { isNot: null },
          pairing_leg: { some: { flight: { service_date: window } } },
        },
        select: {
          ...PAIRING_SELECT,
          roster_run_pairing: { select: { roster_run: { select: { id: true, date_from: true, date_to: true, status: true } } } },
        },
        orderBy: { created_at: 'asc' },
      }),
      this.nextPairingNumber(),
    ])

    const free = flights.filter((flight) => flight.pairing_leg === null)
    const chains = buildChains(
      free,
      params.base,
      MIN_CONNECTION_MINUTES,
      (seed, flight) => this.spanDays(seed.dep_at, flight.arr_at, context.timeZone) <= context.defaults.maxPairingDays,
    )

    // Pairings committed earlier are listed too, first and locked, so Ops can see what is already on its way to Assign crew.
    const pairings: PairingRow[] = committedRows.map((row) => this.toPairingRow(row, context))
    const proposedIn = new Map<string, string>()
    chains.forEach((chain, index) => {
      const code = `P-${nextNumber + index}`
      const id = `draft-${code}`
      const legs = chain.map((flight): FlightLegRow => ({ ...this.toFlightFields(flight), flightId: flight.id, addedManually: false }))
      pairings.push({
        id,
        code,
        base: params.base,
        legs,
        rosterRunId: null,
        rosterRunStatus: null,
        published: false,
        limits: this.limitsFor(legs, context),
      })
      for (const flight of chain) proposedIn.set(flight.id, id)
    })

    return {
      pairings,
      flights: flights.map((flight) => ({
        ...this.toFlightFields(flight),
        status: flight.pairing_leg || proposedIn.has(flight.id) ? 'paired' : 'available',
        pairingId: proposedIn.get(flight.id) ?? flight.pairing_leg?.pairing_id ?? null,
      })),
      rosterRun,
      committed: committedRows.flatMap((row) => {
        const run = row.roster_run_pairing?.roster_run
        if (!run) return []
        return [
          {
            code: row.code,
            rosterRunId: run.id,
            runDateFrom: run.date_from.toISOString().slice(0, 10),
            runDateTo: run.date_to.toISOString().slice(0, 10),
            runStatus: run.status === 'published' ? ('published' as const) : ('draft' as const),
          },
        ]
      }),
    }
  }

  /** The number the next pairing code will carry (`P-` + the sequence), so a proposal can show the code it will get. */
  private async nextPairingNumber(): Promise<number> {
    const [sequence] = await this.db.$queryRaw<
      { last_value: bigint; is_called: boolean }[]
    >`SELECT last_value, is_called FROM pairing_code_seq`
    return Number(sequence.last_value) + (sequence.is_called ? 1 : 0)
  }

  /**
   * Replaces a pairing's legs.
   *
   * Legs are diffed rather than rewritten so the ones that stay keep their row. A pairing
   * in a published run is refused; one in a draft run is taken out of the run.
   */
  async saveLegs(pairingId: string, legs: SaveLegInput[]): Promise<SaveLegsResult> {
    const flightIds = [...new Set(legs.map((leg) => leg.flightId))]
    if (flightIds.length === 0) throw new BadRequestException('A pairing needs at least one flight. Delete the pairing instead.')

    const row = await this.findPairing(pairingId)
    const run = row.roster_run_pairing?.roster_run ?? null
    if (run?.status === 'published') throw this.inUse(row.code)

    const flights = await this.db.flight.findMany({
      where: { id: { in: flightIds } },
      select: { id: true, flight_number: true, pairing_leg: { select: { pairing_id: true } } },
    })
    if (flights.length !== flightIds.length) throw new NotFoundException('One or more flights were not found')
    const taken = flights.find((flight) => flight.pairing_leg !== null && flight.pairing_leg.pairing_id !== pairingId)
    if (taken) throw new ConflictException(`${taken.flight_number} is already in another pairing`)

    const keep = new Set(flightIds)
    const current = new Set(row.pairing_leg.map((leg) => leg.flight.id))
    const removedLegIds = row.pairing_leg.filter((leg) => !keep.has(leg.flight.id)).map((leg) => leg.id)
    const manual = new Set(legs.filter((leg) => leg.addedManually).map((leg) => leg.flightId))
    const added = flightIds.filter((flightId) => !current.has(flightId))
    const changed = removedLegIds.length > 0 || added.length > 0

    if (changed) {
      await this.mapUniqueViolation(
        () =>
          this.db.$transaction(async (tx) => {
            if (run) await this.withdrawFromRun(tx, pairingId)
            if (removedLegIds.length > 0) await tx.pairing_leg.deleteMany({ where: { id: { in: removedLegIds } } })
            if (added.length > 0) {
              await tx.pairing_leg.createMany({
                data: added.map((flightId) => ({
                  pairing_id: pairingId,
                  flight_id: flightId,
                  added_by: manual.has(flightId) ? 'ops' : 'auto',
                })),
              })
            }
            await tx.pairing.update({ where: { id: pairingId }, data: { updated_at: new Date() } })
          }),
        'One of these flights was added to another pairing at the same time.',
      )
    }

    const context = await this.loadContext(row.base_airport)
    return { pairing: this.toPairingRow(await this.findPairing(pairingId), context), withdrawnFromRun: changed && run !== null }
  }

  /** Hard-deletes a draft pairing; its flights go back to the unpaired list. */
  async deletePairing(pairingId: string): Promise<DeletePairingResult> {
    const row = await this.findPairing(pairingId)
    const run = row.roster_run_pairing?.roster_run ?? null
    if (run?.status === 'published') throw this.inUse(row.code)

    await this.db.$transaction(async (tx) => {
      if (run) await this.withdrawFromRun(tx, pairingId)
      await tx.pairing.delete({ where: { id: pairingId } })
    })

    const legs = this.sortedLegs(row)
    return {
      id: row.id,
      code: row.code,
      releasedFlightIds: legs.map((leg) => leg.flight.id),
      releasedFlightNumbers: legs.map((leg) => leg.flight.flight_number),
    }
  }

  /** Deletes the window's pairings that are not in any roster run yet. Committed ones are kept. */
  async clearPairings(params: BuildParams): Promise<{ deleted: number; kept: number }> {
    return this.discardDrafts(params)
  }

  private async discardDrafts(params: BuildParams): Promise<{ deleted: number; kept: number }> {
    const rows = await this.db.pairing.findMany({
      where: { base_airport: params.base, pairing_leg: { some: { flight: { service_date: this.serviceDates(params) } } } },
      select: { id: true, roster_run_pairing: { select: { pairing_id: true } } },
    })
    const drafts = rows.filter((row) => row.roster_run_pairing === null).map((row) => row.id)
    if (drafts.length > 0) await this.db.pairing.deleteMany({ where: { id: { in: drafts } } })
    return { deleted: drafts.length, kept: rows.length - drafts.length }
  }

  /**
   * Stores the pairings Ops chose and puts them in the draft run for exactly this base and
   * window, creating the run on the first commit.
   *
   * This is the moment a pairing becomes data. Each draft arrives as a list of flights; the
   * legality checks run again here, because the page's preview is only a preview, and a draft
   * that fails them is left out and reported by its `ref`. So are drafts with a leg outside the
   * run's dates and drafts with a flight that someone else paired in the meantime.
   */
  async commitPairings(params: BuildParams, drafts: CommitDraft[]): Promise<CommitResult> {
    if (drafts.length === 0) throw new BadRequestException('NO_PAIRINGS · Choose at least one valid pairing to commit')
    const context = await this.loadContext(params.base)
    const window = this.serviceDates(params)
    const runs = await this.db.roster_run.findMany({
      where: { base_airport: params.base, date_from: window.gte, date_to: window.lte },
      select: { id: true, status: true },
      orderBy: { created_at: 'desc' },
    })
    if (runs.some((run) => run.status === 'published')) {
      throw new ConflictException(`The roster run for ${params.base} · ${params.dateFrom} to ${params.dateTo} is already published`)
    }

    const flightIds = [...new Set(drafts.flatMap((draft) => draft.legs.map((leg) => leg.flightId)))]
    const flights = await this.db.flight.findMany({
      where: { id: { in: flightIds } },
      select: { ...FLIGHT_SELECT, service_date: true, status: true, pairing_leg: { select: { pairing_id: true } } },
    })
    const byId = new Map(flights.map((flight) => [flight.id, flight]))
    if (flightIds.some((id) => !byId.has(id))) throw new NotFoundException('One or more flights were not found')

    const ready: { draft: CommitDraft; legs: { flightId: string; addedManually: boolean }[] }[] = []
    const skippedInvalid: string[] = []
    const skippedOutsideWindow: string[] = []
    const skippedTaken: string[] = []
    const claimed = new Set<string>()
    for (const draft of drafts) {
      const rows = draft.legs.map((leg) => byId.get(leg.flightId)!)
      const unique = new Set(draft.legs.map((leg) => leg.flightId)).size === draft.legs.length
      if (!unique || rows.some((row) => row.pairing_leg !== null || claimed.has(row.id))) {
        skippedTaken.push(draft.ref)
        continue
      }

      const ordered = [...rows].sort((a, b) => a.dep_at.getTime() - b.dep_at.getTime())
      const legs = ordered.map((row): FlightLegRow => ({ ...this.toFlightFields(row), flightId: row.id, addedManually: false }))
      if (
        ordered.some((row) => UNPAIRABLE_FLIGHT_STATUSES.includes(row.status)) ||
        this.evaluate(legs, params.base, this.limitsFor(legs, context), context.timeZone).status === 'failed'
      ) {
        skippedInvalid.push(draft.ref)
      } else if (ordered.some((row) => row.service_date < window.gte || row.service_date > window.lte)) {
        skippedOutsideWindow.push(draft.ref)
      } else {
        ready.push({ draft, legs: draft.legs })
        for (const row of rows) claimed.add(row.id)
      }
    }

    const { run, committed } = await this.mapUniqueViolation(
      () =>
        this.db.$transaction(async (tx) => {
          const target =
            runs[0] ??
            (await tx.roster_run.create({
              data: { base_airport: params.base, date_from: window.gte, date_to: window.lte, status: 'draft' },
              select: { id: true, status: true },
            }))
          // One at a time and in order, so the codes follow the order of the list.
          const stored: { ref: string; id: string; code: string }[] = []
          for (const { draft, legs } of ready) {
            const manual = new Set(legs.filter((leg) => leg.addedManually).map((leg) => leg.flightId))
            const created = await tx.pairing.create({
              data: {
                base_airport: params.base,
                pairing_leg: {
                  create: legs.map((leg) => ({ flight_id: leg.flightId, added_by: manual.has(leg.flightId) ? 'ops' : 'auto' })),
                },
              },
              select: { id: true, code: true },
            })
            stored.push({ ref: draft.ref, id: created.id, code: created.code })
          }
          if (stored.length > 0) {
            await tx.roster_run_pairing.createMany({ data: stored.map((row) => ({ roster_run_id: target.id, pairing_id: row.id })) })
            await tx.roster_run.update({ where: { id: target.id }, data: { updated_at: new Date() } })
          }
          return { run: target, committed: stored.map(({ ref, code }) => ({ ref, code })) }
        }),
      'Some of these flights were paired by someone else at the same time. Generate again.',
    )

    return {
      rosterRun: { id: run.id, base: params.base, dateFrom: params.dateFrom, dateTo: params.dateTo, status: 'draft' },
      committed,
      skippedInvalid,
      skippedOutsideWindow,
      skippedTaken,
    }
  }

  /* ── legality ───────────────────────────────────────────────────────────── */

  /**
   * The pairing checks, in the order the inspector prints them. The staff-web
   * `pairing-engine` mirrors these rules with the same limits for its live preview;
   * this one is the one that decides what may be committed.
   */
  evaluate(legs: FlightLegRow[], base: string, limits: PairingLimitsRow, timeZone: string): PairingEvaluationRow {
    if (legs.length === 0) {
      return { status: 'failed', checks: [{ code: 'PAIRING_EMPTY', status: 'failed', detail: 'A pairing needs at least one flight.' }] }
    }

    const checks: LegalityCheckRow[] = []
    const add = (code: PairingErrorCode, passed: boolean, detail: string): void => {
      checks.push(passed ? { code, status: 'passed' } : { code, status: 'failed', detail })
    }

    const first = legs[0]
    const last = legs[legs.length - 1]
    add(
      'PAIRING_NOT_CLOSED',
      first.origin === base && last.destination === base,
      first.origin !== base ? `Starts in ${first.origin}, not at base ${base}.` : `Ends in ${last.destination}, not at base ${base}.`,
    )

    const gap = legs.findIndex(
      (leg, index) => index > 0 && (leg.origin !== legs[index - 1].destination || leg.departureAt < legs[index - 1].arrivalAt),
    )
    add(
      'SEQUENCE_BROKEN',
      gap === -1,
      gap === -1 ? '' : `${legs[gap].flightNumber} leaves ${legs[gap].origin} but the leg before it ends at ${legs[gap - 1].destination}.`,
    )

    const days = this.dutyDays(legs, timeZone)
    const busiest = Math.max(...days.map((day) => day.length))
    add(
      'FLIGHTS_PER_DAY_EXCEEDED',
      busiest <= limits.maxFlightsPerDuty,
      `A duty day runs ${busiest} flights, over the limit of ${limits.maxFlightsPerDuty}.`,
    )

    const longest = Math.max(...days.map((day) => this.dutyMinutes(day, limits)))
    add(
      'DUTY_DAY_EXCEEDED',
      longest <= limits.maxDutyHours * 60,
      `A duty day runs ${durationLabel(longest)}, over the ${limits.maxDutyHours}h limit.`,
    )

    const span = this.spanDays(new Date(first.departureAt), new Date(last.arrivalAt), timeZone)
    add('PAIRING_TOO_LONG', span <= limits.maxPairingDays, `Pairing runs ${span} days, over the ${limits.maxPairingDays} day limit.`)

    return { status: checks.some((check) => check.status === 'failed') ? 'failed' : 'passed', checks }
  }

  /** Consecutive legs that depart on the same local day form one duty. */
  private dutyDays(legs: FlightLegRow[], timeZone: string): FlightLegRow[][] {
    const days: FlightLegRow[][] = []
    for (const leg of legs) {
      const current = days[days.length - 1]
      if (current && localDay(new Date(current[0].departureAt), timeZone) === localDay(new Date(leg.departureAt), timeZone))
        current.push(leg)
      else days.push([leg])
    }
    return days
  }

  /** Report before the first departure to release after the last arrival. */
  private dutyMinutes(day: FlightLegRow[], limits: PairingLimitsRow): number {
    const start = Date.parse(day[0].departureAt) - limits.reportMinutes * 60_000
    const end = Date.parse(day[day.length - 1].arrivalAt) + limits.releaseMinutes * 60_000
    return Math.max(0, Math.round((end - start) / 60_000))
  }

  /** Calendar days from the first departure to the last arrival, both local, inclusive. */
  private spanDays(from: Date, to: Date, timeZone: string): number {
    return Math.round((Date.parse(localDay(to, timeZone)) - Date.parse(localDay(from, timeZone))) / 86_400_000) + 1
  }

  /* ── limits ─────────────────────────────────────────────────────────────── */

  private async loadContext(base: string): Promise<LimitsContext> {
    const [settings, countryRules, airports] = await Promise.all([
      this.db.crew_setting.findMany({ select: { key: true, value: true } }),
      this.db.country_legality_rule.findMany({ select: { country_code: true, min_rest_hours: true, max_duty_hours: true } }),
      this.db.airport.findMany({ select: { iata_code: true, country: true, timezone: true } }),
    ])

    const baseAirport = airports.find((airport) => airport.iata_code === base)
    if (!baseAirport) throw new NotFoundException(`Base ${base} was not found`)

    const setting = new Map(settings.map((row) => [row.key, Number.parseFloat(row.value)]))
    const read = (key: string, fallback: number): number => {
      const value = setting.get(key)
      return value !== undefined && Number.isFinite(value) ? value : fallback
    }

    return {
      defaults: {
        maxFlightsPerDuty: read('max_flights_per_duty', DEFAULT_LIMITS.maxFlightsPerDuty),
        maxDutyHours: read('max_duty_hours', DEFAULT_LIMITS.maxDutyHours),
        maxPairingDays: read('max_pairing_days', DEFAULT_LIMITS.maxPairingDays),
        minRestHours: read('min_rest_hours', DEFAULT_LIMITS.minRestHours),
        reportMinutes: read('report_minutes', DEFAULT_LIMITS.reportMinutes),
        releaseMinutes: read('release_minutes', DEFAULT_LIMITS.releaseMinutes),
      },
      countryRules: new Map(
        countryRules.map((rule) => [
          rule.country_code,
          { minRestHours: Number(rule.min_rest_hours), maxDutyHours: Number(rule.max_duty_hours) },
        ]),
      ),
      airportCountry: new Map(airports.map((airport) => [airport.iata_code, airport.country.toLowerCase()])),
      timeZone: baseAirport.timezone,
    }
  }

  /**
   * The defaults, tightened by every destination country the pairing visits. A country
   * row can only make a limit stricter (more rest, less duty), never looser.
   */
  private limitsFor(legs: FlightLegRow[], context: LimitsContext): PairingLimitsRow {
    const limits = { ...context.defaults }
    for (const leg of legs) {
      const rule = context.countryRules.get(context.airportCountry.get(leg.destination) ?? '')
      if (!rule) continue
      limits.minRestHours = Math.max(limits.minRestHours, rule.minRestHours)
      limits.maxDutyHours = Math.min(limits.maxDutyHours, rule.maxDutyHours)
    }
    return limits
  }

  /* ── reads and writes ───────────────────────────────────────────────────── */

  private async findPairing(pairingId: string): Promise<PairingDbRow> {
    const row = await this.db.pairing.findUnique({ where: { id: pairingId }, select: PAIRING_SELECT })
    if (!row) throw new NotFoundException(`Pairing ${pairingId} was not found`)
    return row
  }

  /** The run for exactly this base and window; the newest one if there are several. */
  private async findRun(params: BuildParams): Promise<RosterRunRow | null> {
    const window = this.serviceDates(params)
    const run = await this.db.roster_run.findFirst({
      where: { base_airport: params.base, date_from: window.gte, date_to: window.lte },
      select: { id: true, status: true },
      orderBy: { created_at: 'desc' },
    })
    return run
      ? {
          id: run.id,
          base: params.base,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
          status: run.status === 'published' ? 'published' : 'draft',
        }
      : null
  }

  /**
   * Takes a pairing out of its draft run: its rule breaks, its assignments, then the run
   * link. Only ever called after the run was checked to be a draft.
   */
  private async withdrawFromRun(tx: Prisma.TransactionClient, pairingId: string): Promise<void> {
    await tx.rule_break.deleteMany({ where: { pairing_id: pairingId } })
    await tx.pairing_leg_assignment.deleteMany({ where: { pairing_id: pairingId } })
    await tx.roster_run_pairing.deleteMany({ where: { pairing_id: pairingId } })
  }

  /** A flight is in one pairing at most (`pairing_leg.flight_id` is unique). */
  private async mapUniqueViolation<T>(write: () => Promise<T>, message: string): Promise<T> {
    try {
      return await write()
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(message)
      throw error
    }
  }

  private inUse(code: string): ConflictException {
    return new ConflictException(`PAIRING_IN_USE · ${code} is part of a published roster. Change it in Fix & publish instead.`)
  }

  /* ── mapping ────────────────────────────────────────────────────────────── */

  private toPairingRow(row: PairingDbRow, context: LimitsContext): PairingRow {
    const legs = this.sortedLegs(row).map((leg): FlightLegRow => ({
      ...this.toFlightFields(leg.flight),
      flightId: leg.flight.id,
      addedManually: leg.added_by === 'ops',
    }))
    const run = row.roster_run_pairing?.roster_run ?? null
    const runStatus = run === null ? null : run.status === 'published' ? 'published' : 'draft'
    return {
      id: row.id,
      code: row.code,
      base: row.base_airport,
      legs,
      rosterRunId: run?.id ?? null,
      rosterRunStatus: runStatus,
      published: runStatus === 'published',
      limits: this.limitsFor(legs, context),
    }
  }

  private sortedLegs(row: PairingDbRow): PairingDbRow['pairing_leg'] {
    return [...row.pairing_leg].sort((a, b) => a.flight.dep_at.getTime() - b.flight.dep_at.getTime())
  }

  private toFlightFields(flight: FlightDbRow): Omit<ScheduledFlightRow, 'status' | 'pairingId'> {
    return {
      id: flight.id,
      flightNumber: flight.flight_number,
      origin: flight.route.origin,
      destination: flight.route.destination,
      departureAt: flight.dep_at.toISOString(),
      arrivalAt: flight.arr_at.toISOString(),
    }
  }

  /** The window as a `service_date` filter. */
  private serviceDates(params: BuildParams): { gte: Date; lte: Date } {
    if (params.dateTo < params.dateFrom) throw new BadRequestException('dateTo must be on or after dateFrom')
    return { gte: new Date(`${params.dateFrom}T00:00:00.000Z`), lte: new Date(`${params.dateTo}T00:00:00.000Z`) }
  }
}

/** `YYYY-MM-DD` of an instant in the given timezone. */
function localDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

/** `6h 45m`. */
function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours === 0 ? `${rest}m` : `${hours}h ${String(rest).padStart(2, '0')}m`
}
