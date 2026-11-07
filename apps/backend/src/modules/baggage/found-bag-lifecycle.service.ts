import { Inject, Injectable } from '@nestjs/common'
import type { found_bag } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { BAG_COLOURS, BAG_TYPES, type BagColour, type BagType } from './common/baggage.constants'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
import type { FoundBag } from './common/found-bag.types'
import { UUID_PATTERN, prismaErrorCode } from './common/patterns'
import { toFoundBag } from './found-bag.service'

/** Used when baggage_setting has no valid unclaimed_after_days (the migration seeds 90). */
export const DEFAULT_UNCLAIMED_AFTER_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/** A check-in whose bags went into the hold. */
const FLOWN_CHECK_IN_STATUSES = ['checked_in', 'boarded']

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
 * Diverted-flight bags and the unclaimed timeout. There is no scheduler or Feature 2 event consumer in the backend yet,
 * so staff trigger both through the API; a cron job or event handler can call the same methods later.
 */
@Injectable()
export class FoundBagLifecycleService {
  constructor(
    private readonly db: DbService,
    @Inject(FOUND_BAG_CLOCK) private readonly clock: FoundBagClock,
  ) {}

  /**
   * Adds one held found_bag (source diverted_flight) per tagged bag in the hold of a diverted flight, at the airport it
   * landed at, with an at_diverted_airport event written by the system. Safe to run twice: bags that already have a
   * live row are skipped.
   */
  async recordDiversion(flightId: string): Promise<DiversionResult> {
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

    if (bag.status !== 'held') {
      throw invalidStatus(`A ${bag.status} bag can no longer be changed`)
    }

    const row = await this.db.found_bag.update({
      where: { id: foundBagId },
      data: {
        bag_type: input.bagType,
        colour: input.colour,
        brand: input.brand?.trim() || null,
        description: input.description?.trim() || null,
        updated_at: new Date(),
      },
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

    if (bag.status !== 'held') {
      throw invalidStatus(`A ${bag.status} bag cannot continue with its flight`)
    }

    const flight = await this.db.flight.findUnique({ where: { id: bag.flightId }, select: { route: { select: { destination: true } } } })
    const destination = flight?.route.destination ?? null

    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.found_bag.update({
        where: { id: foundBagId },
        data: { status: 'continued_with_flight', updated_at: new Date() },
      })

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

      return updated
    })

    return toFoundBag(row)
  }

  /**
   * Marks held bags with no confirmed match as unclaimed once unclaimed_after_days have passed since found_at. They stay
   * on record but can no longer be matched or delivered.
   */
  async markUnclaimed(): Promise<UnclaimedSweepResult> {
    const setting = await this.db.baggage_setting.findUnique({ where: { key: 'unclaimed_after_days' }, select: { value: true } })
    const parsed = Number(setting?.value)
    const unclaimedAfterDays = Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_UNCLAIMED_AFTER_DAYS
    const cutoff = new Date(this.clock.now().getTime() - unclaimedAfterDays * DAY_MS)

    const { count } = await this.db.found_bag.updateMany({
      where: { status: 'held', found_at: { lte: cutoff }, bag_match: { none: { status: 'confirmed' } } },
      data: { status: 'unclaimed', updated_at: new Date() },
    })

    return { unclaimedAfterDays, cutoff, marked: count }
  }

  private async findBag(foundBagId: string): Promise<FoundBag> {
    const row = UUID_PATTERN.test(foundBagId) ? await this.db.found_bag.findUnique({ where: { id: foundBagId } }) : null

    if (!row) {
      throw notFound()
    }

    return toFoundBag(row)
  }
}
