import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { CheckDto, CheckPipe } from './dto/screening.dto'
import { ScreeningContext, ScreeningAudit, type ScreeningActor, type SystemScreeningActor } from './screening.context'
import { ScreeningMatcher } from './screening.matcher'
import { clearance, decisionsByEntry, initialOutcome, type Identity } from './screening.rules'

export async function identityChecks(tx: Prisma.TransactionClient, flightId: string, identity: Identity) {
  // Restrict history in SQL, including identity copies owned by different customer accounts.
  const ids = await tx.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM screening_check c WHERE c.flight_id = ${flightId}::uuid AND (
      (c.passenger_id = ${identity.id ?? null}::uuid
        AND name_key(c.snap_first_name, c.snap_last_name) = name_key(${identity.first_name}, ${identity.last_name})
        AND c.snap_date_of_birth IS NOT DISTINCT FROM ${identity.date_of_birth}::date
        AND c.snap_passport IS NOT DISTINCT FROM ${identity.passport_number}::text
        AND c.snap_nationality IS NOT DISTINCT FROM ${identity.nationality}::text)
      OR
      (${identity.passport_number}::text IS NOT NULL AND c.snap_passport = ${identity.passport_number}
        AND c.snap_nationality = ${identity.nationality} AND c.snap_nationality IS NOT NULL)
      OR (${identity.passport_number}::text IS NULL AND c.snap_passport IS NULL
        AND name_key(c.snap_first_name, c.snap_last_name) = name_key(${identity.first_name}, ${identity.last_name})
        AND c.snap_date_of_birth = ${identity.date_of_birth}::date AND c.snap_date_of_birth IS NOT NULL)
    )
  `
  return tx.screening_check.findMany({
    where: { id: { in: ids.map((row) => row.id) } },
    include: { screening_review: { orderBy: { revision: 'desc' }, take: 1 } },
  })
}

@Injectable()
export class ScreeningCheckService {
  private readonly logger = new Logger(ScreeningCheckService.name)

  constructor(
    private readonly context: ScreeningContext,
    private readonly matcher: ScreeningMatcher,
    private readonly audit: ScreeningAudit,
  ) {}

  async check(userId: string, request: CheckDto) {
    const input = new CheckPipe().transform(request)
    return this.context.run(userId, (tx, actor, now) => this.execute(tx, actor, now, input))
  }

  // Internal provider API only; never expose this method through a public controller.
  // Screening that cannot run must not block a purchase but must not let a passenger board: check-in fails closed (held, "see an
  // agent") and booking fails open, with the skipped screening recorded. Caller mistakes (HttpException) still surface as errors.
  async checkSystem(source: string, request: CheckDto) {
    try {
      return await this.context.runSystem((tx, now) => this.checkSystemInTransaction(tx, now, source, request))
    } catch (error) {
      const trigger = request?.triggerPoint
      if (error instanceof HttpException && error.getStatus() < 500) throw error
      if (trigger !== 'check_in' && trigger !== 'booking') throw error
      this.logger.error(`Screening could not run for ${trigger}: ${error instanceof Error ? error.message : String(error)}`)
      await this.context
        .runSystem((tx, now) =>
          this.audit.record(tx, { source }, now, 'create', 'screening_skipped', undefined, {
            triggerPoint: trigger,
            passengerId: request.passengerId,
            flightId: request.flightId,
            outcome: trigger === 'check_in' ? 'held' : 'clear',
          }),
        )
        .catch(() => undefined)
      return { skipped: true as const, outcome: trigger === 'check_in' ? ('held' as const) : ('clear' as const) }
    }
  }

  async checkSystemInTransaction(tx: Prisma.TransactionClient, now: Date, source: string, request: CheckDto, entryId?: string) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(source)) throw new BadRequestException('A caller source is required')
    const input = new CheckPipe().transform(request)
    return this.execute(tx, { source }, now, input, entryId)
  }

  private async execute(
    tx: Prisma.TransactionClient,
    actor: ScreeningActor | SystemScreeningActor,
    now: Date,
    input: CheckDto,
    entryId?: string,
  ) {
    const passenger = await tx.passenger.findFirst({ where: { id: input.passengerId, deleted_at: null } })
    const flight = await tx.flight.findUnique({ where: { id: input.flightId }, select: { id: true, dep_at: true, status: true } })
    if (!passenger || !flight) throw new NotFoundException('Passenger or flight was not found')
    // A missing nationality is allowed (a passport match can still be Probable); a malformed one is not.
    if (passenger.nationality && !/^[a-z]{2}$/.test(passenger.nationality))
      throw new BadRequestException('Passenger nationality must be in lowercase alpha-2 format')
    if (['cancelled', 'departed', 'arrived'].includes(flight.status) || flight.dep_at <= now)
      throw new BadRequestException('Screening requires an upcoming, non-cancelled flight')
    const history = await identityChecks(tx, input.flightId, passenger)
    const decisions = decisionsByEntry(history, passenger)
    const matches = (await this.matcher.match(tx, passenger)).filter((match) => !entryId || match.entry.id === entryId)
    const runId = randomUUID()
    const checkIds: string[] = []
    const reusedCheckIds: string[] = []
    const skippedEntryIds: string[] = []
    const base = {
      run_id: runId,
      passenger_id: passenger.id,
      flight_id: input.flightId,
      pnr_id: input.pnrId ?? null,
      trigger_point: input.triggerPoint,
      occurred_at: now,
      snap_first_name: passenger.first_name,
      snap_last_name: passenger.last_name,
      snap_date_of_birth: passenger.date_of_birth,
      snap_gender: passenger.gender,
      snap_nationality: passenger.nationality,
      snap_passport: passenger.passport_number,
    }
    const repeatable = input.triggerPoint === 'identity_change' || input.triggerPoint === 'entry_change'
    const existingChecks = repeatable
      ? []
      : await tx.screening_check.findMany({
          where: {
            passenger_id: passenger.id,
            flight_id: input.flightId,
            trigger_point: input.triggerPoint,
            watchlist_entry_id: { in: matches.map((match) => match.entry.id) },
          },
        })
    const existingByEntry = new Map(existingChecks.map((check) => [check.watchlist_entry_id, check]))
    const inserts: Prisma.screening_checkCreateManyInput[] = []
    for (const match of matches) {
      if (decisions.has(match.entry.id)) {
        skippedEntryIds.push(match.entry.id)
        continue
      }
      const existing = existingByEntry.get(match.entry.id)
      if (existing) {
        if (
          existing.snap_first_name !== passenger.first_name ||
          existing.snap_last_name !== passenger.last_name ||
          existing.snap_passport !== passenger.passport_number ||
          existing.snap_nationality !== passenger.nationality ||
          existing.snap_date_of_birth?.getTime() !== passenger.date_of_birth?.getTime()
        )
          throw new ConflictException('Identity changed; request screening with identity_change')
        reusedCheckIds.push(existing.id)
        continue
      }
      const entry = match.entry
      inserts.push({
        ...base,
        watchlist_entry_id: entry.id,
        match_level: match.level,
        outcome: initialOutcome(match.level, input.triggerPoint),
        name_similarity: match.similarity,
        snap_entry_first_name: entry.first_name,
        snap_entry_last_name: entry.last_name,
        snap_entry_date_of_birth: entry.date_of_birth,
        snap_entry_gender: entry.gender,
        snap_entry_nationality: entry.nationality,
        snap_entry_passport: entry.passport_number,
      })
    }
    if (inserts.length) {
      const rows = await tx.screening_check.createManyAndReturn({ data: inserts, select: { id: true } })
      checkIds.push(...rows.map((row) => row.id))
    }
    // A new_entry or entry_change pass writes rows only for hits; a clean pass leaves no row.
    const hitsOnly = input.triggerPoint === 'new_entry' || input.triggerPoint === 'entry_change'
    if (!hitsOnly && !checkIds.length && !reusedCheckIds.length && !matches.length) {
      const existing = repeatable
        ? null
        : await tx.screening_check.findFirst({
            where: {
              passenger_id: passenger.id,
              flight_id: input.flightId,
              trigger_point: input.triggerPoint,
              watchlist_entry_id: null,
              snap_first_name: passenger.first_name,
              snap_last_name: passenger.last_name,
              snap_passport: passenger.passport_number,
              snap_date_of_birth: passenger.date_of_birth,
              snap_nationality: passenger.nationality,
            },
          })
      if (existing) reusedCheckIds.push(existing.id)
      else {
        const row = await tx.screening_check.create({ data: { ...base, match_level: 'none', outcome: 'clear' } })
        checkIds.push(row.id)
      }
    }
    const outcome = clearance(await identityChecks(tx, input.flightId, passenger), passenger)
    await this.audit.record(tx, actor, now, 'create', 'screening_run', runId, {
      checkIds,
      reusedCheckIds,
      skippedEntryIds,
      triggerPoint: input.triggerPoint,
      outcome,
    })
    return {
      runId,
      checkIds,
      reusedCheckIds,
      skippedEntryIds,
      // Booking never blocks the purchase, so it always reports clear; the real clearance is still audited above.
      outcome: input.triggerPoint === 'booking' ? ('clear' as const) : outcome,
      now: now.toISOString(),
      integrations: { checkIn: 'not_connected' },
    }
  }

  async status(userId: string, passengerId: string, flightId: string) {
    return this.context.run(userId, async (tx, actor, now) => {
      const passenger = await tx.passenger.findFirst({ where: { id: passengerId, deleted_at: null } })
      if (!passenger) throw new NotFoundException('Passenger was not found')
      const checks = await identityChecks(tx, flightId, passenger)
      await this.audit.record(tx, actor, now, 'view_sensitive', 'screening_status')
      // No evidence of a run is not permission to check in.
      return { outcome: checks.length ? clearance(checks, passenger) : 'not_screened', now: now.toISOString(), checkIn: 'not_connected' }
    })
  }
}
