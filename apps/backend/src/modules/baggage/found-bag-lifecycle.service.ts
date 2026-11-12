import { Inject, Injectable } from '@nestjs/common'
import type { found_bag } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { AuditService, type AuditActor } from '@backend/modules/admin-console/audit/audit.service'
import { AUDIT_SOURCE_FEATURE, BAG_COLOURS, BAG_TYPES, type BagColour, type BagType } from './common/baggage.constants'
import { lockFoundBag, shareLockBaggageSetting } from './common/case-locks'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
import type { FoundBag } from './common/found-bag.types'
import { UUID_PATTERN, prismaErrorCode } from './common/patterns'
import { toFoundBag } from './found-bag.service'

/** Used when baggage_setting has no valid unclaimed_after_days (the migration seeds 90). */
export const DEFAULT_UNCLAIMED_AFTER_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/** A check-in whose bags went into the hold. */
export const FLOWN_CHECK_IN_STATUSES = ['checked_in', 'boarded']

export interface DiversionResult {
  flightId: string
  divertedTo: string
  created: FoundBag[]
  /** Checked bags that already had a live found_bag row, so none was added. */
  skipped: number
}

export interface CompleteDetailsInput {
  bagType: BagType
  colour: BagColour
  brand?: string | null
  description?: string | null
}

export interface UnclaimedSweepResult {
  unclaimedAfterDays: number
  cutoff: Date
  marked: number
}

function notFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.FOUND_BAG_NOT_FOUND, 'Found bag not found')
}

function invalidStatus(message: string): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_STATUS, message)
}

function requireStaff(staffId: string): void {
  if (!staffId || !UUID_PATTERN.test(staffId)) {
    throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_FOUND_BAG, 'Recording staff member is required')
  }
}

/**
 * Diverted-flight bags and the unclaimed timeout. Staff add a diverted flight's bags from the Found bags page (Feature 2
 * has no event to listen to yet), and FoundBagUnclaimedRunner runs the unclaimed sweep every minute as the system.
 * Both write what they changed to audit_log.
 */
@Injectable()
export class FoundBagLifecycleService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    @Inject(FOUND_BAG_CLOCK) private readonly clock: FoundBagClock,
  ) {}

  /**
   * Adds one held found_bag (source diverted_flight) per tagged bag in the hold of a diverted flight, at the airport it
   * landed at, with an at_diverted_airport event written by the system. Safe to run twice: bags that already have a
   * live row are skipped.
   */
  async recordDiversion(flightId: string, actor: AuditActor = AuditService.systemActor()): Promise<DiversionResult> {
    if (!UUID_PATTERN.test(flightId)) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.FLIGHT_NOT_DIVERTED, 'Flight not found')
    }

    const flight = await this.db.flight.findUnique({ where: { id: flightId }, select: { status: true, actual_destination: true } })

    if (!flight || flight.status !== 'diverted' || !flight.actual_destination) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.FLIGHT_NOT_DIVERTED, 'This flight is not diverted')
    }

    const divertedTo = flight.actual_destination

    const bags = await this.db.checked_bag.findMany({
      where: {
        status: 'tagged',
        deleted_at: null,
        tag_number: { not: null },
        check_in: { flight_id: flightId, status: { in: FLOWN_CHECK_IN_STATUSES } },
        found_bag: { none: { status: { not: 'continued_with_flight' } } },
      },
      select: { id: true, tag_number: true },
    })

    const total = await this.db.checked_bag.count({
      where: {
        status: 'tagged',
        deleted_at: null,
        tag_number: { not: null },
        check_in: { flight_id: flightId, status: { in: FLOWN_CHECK_IN_STATUSES } },
      },
    })

    const foundAt = this.clock.now()
    const now = new Date()

    const created = await this.db
      .$transaction(async (tx) => {
        const rows: found_bag[] = []

        for (const bag of bags) {
          const row = await tx.found_bag.create({
            data: {
              checked_bag_id: bag.id,
              tag_number: bag.tag_number,
              flight_id: flightId,
              found_airport: divertedTo,
              found_at: foundAt,
              source: 'diverted_flight',
              status: 'held',
              recorded_by: null,
              created_at: now,
              updated_at: now,
            },
          })

          await tx.bag_location_event.create({
            data: { found_bag_id: row.id, airport_code: divertedTo, action: 'at_diverted_airport', staff_id: null, occurred_at: foundAt },
          })

          rows.push(row)
        }

        if (rows.length > 0) {
          await this.audit.write(
            {
              actor,
              sourceFeature: AUDIT_SOURCE_FEATURE,
              action: 'create',
              entityType: 'flight',
              entityId: flightId,
              summary: `${rows.length} diverted-flight bag(s) recorded at ${divertedTo}`,
              after: { divertedTo, foundBagIds: rows.map((r) => r.id) },
              occurredAt: foundAt,
            },
            tx,
          )
        }

        return rows
      })
      .catch((e: unknown) => {
        // Another call for the same flight won the race on found_bag_checked_bag_uq; this one rolled back.
        if (prismaErrorCode(e) === 'P2002') {
          throw new FoundBagError(FOUND_BAG_ERROR_CODES.FOUND_BAG_EXISTS, 'This diversion is already being recorded; try again')
        }

        throw e
      })

    return { flightId, divertedTo, created: created.map(toFoundBag), skipped: total - bags.length }
  }

  /** Staff add the type and colour of a diverted-flight bag once they have checked it. */
  async completeDetails(staffId: string, foundBagId: string, input: CompleteDetailsInput): Promise<FoundBag> {
    requireStaff(staffId)

    if (!BAG_TYPES.some((type) => type === input.bagType) || !BAG_COLOURS.some((colour) => colour === input.colour)) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_FOUND_BAG, 'Invalid bag type or colour')
    }

    const bag = await this.findBag(foundBagId)

    if (bag.source !== 'diverted_flight') {
      throw invalidStatus('Only a diverted-flight bag gets its details later')
    }

    const row = await this.db.$transaction(async (tx) => {
      // Lock the bag and check it is still held under the lock, so a match confirmed at the same time cannot have its
      // bag's details changed underneath it.
      const locked = await lockFoundBag(tx, foundBagId)

      if (!locked) {
        throw notFound()
      }

      if (locked.status !== 'held') {
        throw invalidStatus(`A ${locked.status} bag can no longer be changed`)
      }

      const { count } = await tx.found_bag.updateMany({
        where: { id: foundBagId, status: 'held' },
        data: {
          bag_type: input.bagType,
          colour: input.colour,
          brand: input.brand?.trim() || null,
          description: input.description?.trim() || null,
          updated_at: new Date(),
        },
      })

      if (count !== 1) {
        throw invalidStatus('This bag has changed; reload and try again')
      }

      return tx.found_bag.findUniqueOrThrow({ where: { id: foundBagId } })
    })

    return toFoundBag(row)
  }

  /**
   * The bag stayed on the diverted flight and flew on to its destination. The row is closed (continued_with_flight)
   * and a sent event records where it went, so the bag can be recorded again if it goes missing there.
   */
  async continueWithFlight(staffId: string, foundBagId: string): Promise<FoundBag> {
    requireStaff(staffId)

    const bag = await this.findBag(foundBagId)

    if (bag.source !== 'diverted_flight' || !bag.flightId) {
      throw invalidStatus('Only a diverted-flight bag can continue with its flight')
    }

    const flight = await this.db.flight.findUnique({ where: { id: bag.flightId }, select: { route: { select: { destination: true } } } })
    const destination = flight?.route.destination ?? null

    const row = await this.db.$transaction(async (tx) => {
      // Lock the bag, then check it is still held: a match confirmed or a move recorded at the same time either waits
      // for this or is seen here. A held bag has no confirmed case, so there is no case to lock first.
      const locked = await lockFoundBag(tx, foundBagId)

      if (!locked) {
        throw notFound()
      }

      if (locked.status !== 'held') {
        throw invalidStatus(`A ${locked.status} bag cannot continue with its flight`)
      }

      const { count } = await tx.found_bag.updateMany({
        where: { id: foundBagId, status: 'held' },
        data: { status: 'continued_with_flight', updated_at: new Date() },
      })

      if (count !== 1) {
        throw invalidStatus('This bag has changed; reload and try again')
      }

      if (destination && destination !== bag.foundAirport) {
        await tx.bag_location_event.create({
          data: {
            found_bag_id: foundBagId,
            airport_code: bag.foundAirport,
            action: 'sent',
            to_airport: destination,
            sent_on_flight_id: bag.flightId,
            note: 'Continued with the diverted flight',
            staff_id: staffId,
            occurred_at: this.clock.now(),
          },
        })
      }

      return tx.found_bag.findUniqueOrThrow({ where: { id: foundBagId } })
    })

    return toFoundBag(row)
  }

  /**
   * Marks held bags with no confirmed match as unclaimed once unclaimed_after_days have passed since found_at. They stay
   * on record but can no longer be matched or delivered.
   */
  async markUnclaimed(actor: AuditActor = AuditService.systemActor()): Promise<UnclaimedSweepResult> {
    return this.db.$transaction(async (tx) => {
      // The threshold is read under a FOR SHARE lock in this transaction (see shareLockBaggageSetting), so a concurrent
      // settings change cannot commit while this sweep still applies the old value.
      const parsed = Number(await shareLockBaggageSetting(tx, 'unclaimed_after_days'))
      const unclaimedAfterDays = Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_UNCLAIMED_AFTER_DAYS
      const cutoff = new Date(this.clock.now().getTime() - unclaimedAfterDays * DAY_MS)

      const due = { status: 'held', found_at: { lte: cutoff }, bag_match: { none: { status: 'confirmed' } } }

      const rows = await tx.found_bag.findMany({ where: due, select: { id: true } })
      const ids = rows.map((r) => r.id)

      if (ids.length === 0) {
        return { unclaimedAfterDays, cutoff, marked: 0 }
      }

      // The same conditions again, so a bag matched since the read above is left alone.
      const { count } = await tx.found_bag.updateMany({
        where: { id: { in: ids }, ...due },
        data: { status: 'unclaimed', updated_at: new Date() },
      })

      if (count > 0) {
        await this.audit.write(
          {
            actor,
            sourceFeature: AUDIT_SOURCE_FEATURE,
            action: 'status_change',
            entityType: 'found_bag',
            summary: `${count} held bag(s) marked unclaimed after ${unclaimedAfterDays} days`,
            before: { status: 'held' },
            after: { status: 'unclaimed', foundBagIds: ids, cutoff },
          },
          tx,
        )
      }

      return { unclaimedAfterDays, cutoff, marked: count }
    })
  }

  private async findBag(foundBagId: string): Promise<FoundBag> {
    const row = UUID_PATTERN.test(foundBagId) ? await this.db.found_bag.findUnique({ where: { id: foundBagId } }) : null

    if (!row) {
      throw notFound()
    }

    return toFoundBag(row)
  }
}
