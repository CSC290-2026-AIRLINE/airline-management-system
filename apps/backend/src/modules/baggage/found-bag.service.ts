import { Inject, Injectable, Optional } from '@nestjs/common'
import type { Prisma, found_bag } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { BAG_TYPES, BAG_COLOURS, type BagType, type BagColour } from './common/baggage.constants'
import { isValidBaggageTag } from './common/baggage-tag.util'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import type { FoundBag, FoundBagSource, FoundBagStatus } from './common/found-bag.types'
import {
  FOUND_BAG_CLOCK,
  FOUND_BAG_RECORDED_LISTENERS,
  type CheckedBagRecord,
  type FoundBagClock,
  type FoundBagFilter,
  type FoundBagRecordedListener,
} from './common/found-bag.ports'

export const AIRPORT_CODE_PATTERN = /^[A-Z]{3}$/

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface RecordFoundBagInput {
  staffId: string
  foundAirport: string
  bagType: BagType
  colour: BagColour
  tagNumber?: string | null
  flightId?: string | null
  brand?: string | null
  description?: string | null
}

/** Prisma error codes, checked by value so this file never needs the generated client at runtime. */
function prismaErrorCode(e: unknown): string | undefined {
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined
  return typeof code === 'string' ? code : undefined
}

function toFoundBag(row: found_bag): FoundBag {
  return {
    id: row.id,
    checkedBagId: row.checked_bag_id,
    tagNumber: row.tag_number,
    flightId: row.flight_id,
    bagType: row.bag_type as BagType | null,
    colour: row.colour as BagColour | null,
    brand: row.brand,
    description: row.description,
    foundAirport: row.found_airport,
    foundAt: row.found_at,
    source: row.source as FoundBagSource,
    status: row.status as FoundBagStatus,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function alreadyRecorded(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.FOUND_BAG_EXISTS, 'This checked bag is already recorded as found')
}

@Injectable()
export class FoundBagService {
  constructor(
    private readonly db: DbService,
    @Inject(FOUND_BAG_CLOCK) private readonly clock: FoundBagClock,
    @Optional() @Inject(FOUND_BAG_RECORDED_LISTENERS) private readonly listeners: readonly FoundBagRecordedListener[] = [],
  ) {}

  async record(input: RecordFoundBagInput): Promise<FoundBag> {
    const staffId = input.staffId?.trim()
    const foundAirport = input.foundAirport?.trim().toUpperCase()
    const tagNumber = input.tagNumber?.trim() || null
    const flightId = input.flightId?.trim() || null

    if (!staffId || !UUID_PATTERN.test(staffId)) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_FOUND_BAG, 'Recording staff member is required')
    }

    if (!foundAirport || !AIRPORT_CODE_PATTERN.test(foundAirport)) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_FOUND_BAG, 'Found airport must be a 3-letter IATA code')
    }

    // Staff rows always carry type and colour (found_bag CHECK); only diverted-flight rows may leave them empty.
    if (!BAG_TYPES.some((type) => type === input.bagType) || !BAG_COLOURS.some((colour) => colour === input.colour)) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_FOUND_BAG, 'Invalid bag type or colour')
    }

    if (tagNumber && !isValidBaggageTag(tagNumber)) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_TAG, 'Invalid baggage tag number')
    }

    if (flightId && !UUID_PATTERN.test(flightId)) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_FOUND_BAG, 'Invalid flight id')
    }

    // A tag Feature 6 does not know (another airline, damaged tag) is still recorded, just without an owner link.
    const checkedBag = tagNumber ? await this.findCheckedBag(tagNumber) : null

    // Early, friendly check. found_bag_checked_bag_uq is still the real guard (caught as P2002 below).
    if (checkedBag) {
      const existing = await this.db.found_bag.findFirst({
        where: { checked_bag_id: checkedBag.checkedBagId, status: { not: 'continued_with_flight' } },
        select: { id: true },
      })

      if (existing) {
        throw alreadyRecorded()
      }
    }

    // flightId is the flight the bag came off, which can differ from the booked flight when a bag was misrouted,
    // so it is not filled in from Feature 6. updated_at is set by the backend (no trigger, no @updatedAt).
    const now = new Date()
    let row: found_bag

    try {
      row = await this.db.found_bag.create({
        data: {
          checked_bag_id: checkedBag?.checkedBagId ?? null,
          tag_number: tagNumber,
          flight_id: flightId,
          bag_type: input.bagType,
          colour: input.colour,
          brand: input.brand?.trim() || null,
          description: input.description?.trim() || null,
          found_airport: foundAirport,
          found_at: this.clock.now(),
          source: 'staff',
          status: 'held',
          recorded_by: staffId,
          created_at: now,
          updated_at: now,
        },
      })
    } catch (e) {
      const code = prismaErrorCode(e)

      if (code === 'P2002') {
        throw alreadyRecorded()
      }

      // Foreign key: the airport, flight or staff member does not exist.
      if (code === 'P2003') {
        throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_FOUND_BAG, 'Unknown airport, flight or staff member')
      }

      throw e
    }

    const saved = toFoundBag(row)

    for (const listener of this.listeners) {
      await listener.onFoundBagRecorded(saved, checkedBag)
    }

    return saved
  }

  async getById(id: string): Promise<FoundBag> {
    const row = UUID_PATTERN.test(id) ? await this.db.found_bag.findUnique({ where: { id } }) : null

    if (!row) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.FOUND_BAG_NOT_FOUND, 'Found bag not found')
    }

    return toFoundBag(row)
  }

  async list(filter: FoundBagFilter = {}): Promise<FoundBag[]> {
    const where: Prisma.found_bagWhereInput = {}
    const tagNumber = filter.tagNumber?.trim()
    const foundAirport = filter.foundAirport?.trim().toUpperCase()
    const flightId = filter.flightId?.trim()

    if (tagNumber) where.tag_number = tagNumber
    if (filter.status) where.status = filter.status
    if (foundAirport) where.found_airport = foundAirport
    if (flightId) {
      if (!UUID_PATTERN.test(flightId)) return []
      where.flight_id = flightId
    }

    const rows = await this.db.found_bag.findMany({ where, orderBy: [{ found_at: 'desc' }, { id: 'asc' }] })

    return rows.map(toFoundBag)
  }

  private async findCheckedBag(tagNumber: string): Promise<CheckedBagRecord | null> {
    const bag = await this.db.checked_bag.findFirst({
      where: { tag_number: tagNumber, deleted_at: null },
      select: { id: true, tag_number: true, check_in: { select: { booking_passenger_id: true, flight_id: true } } },
    })

    if (!bag?.tag_number) {
      return null
    }

    return {
      checkedBagId: bag.id,
      tagNumber: bag.tag_number,
      bookingPassengerId: bag.check_in.booking_passenger_id,
      flightId: bag.check_in.flight_id,
    }
  }
}
