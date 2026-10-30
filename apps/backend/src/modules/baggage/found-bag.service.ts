import { randomUUID } from 'node:crypto'
import { BAG_TYPES, BAG_COLOURS, type BagType, type BagColour } from './common/baggage.constants'
import { isValidBaggageTag } from './common/baggage-tag.util'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import type { FoundBag } from './common/found-bag.types'
import type {
  CheckedBagDetailsLookup,
  FoundBagClock,
  FoundBagFilter,
  FoundBagRecordedListener,
  FoundBagRepository,
} from './common/found-bag.ports'

export const AIRPORT_CODE_PATTERN = /^[A-Z]{3}$/

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

export class FoundBagService {
  constructor(
    private readonly repository: FoundBagRepository,
    private readonly checkedBags: CheckedBagDetailsLookup,
    private readonly clock: FoundBagClock,
    private readonly listeners: readonly FoundBagRecordedListener[] = [],
  ) {}

  async record(input: RecordFoundBagInput): Promise<FoundBag> {
    const staffId = input.staffId?.trim()
    const foundAirport = input.foundAirport?.trim().toUpperCase()
    const tagNumber = input.tagNumber?.trim() || null

    if (!staffId) {
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

    // A tag Feature 6 does not know (another airline, damaged tag) is still recorded, just without an owner link.
    const checkedBag = tagNumber ? await this.checkedBags.findByTag(tagNumber) : null

    if (checkedBag && (await this.repository.findByCheckedBagId(checkedBag.checkedBagId))) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.FOUND_BAG_EXISTS, 'This checked bag is already recorded as found')
    }

    const now = new Date()

    // flightId is the flight the bag came off, which can differ from the booked flight when a bag was misrouted,
    // so it is not filled in from Feature 6.
    const bag: FoundBag = {
      id: randomUUID(),
      checkedBagId: checkedBag?.checkedBagId ?? null,
      tagNumber,
      flightId: input.flightId?.trim() || null,
      bagType: input.bagType,
      colour: input.colour,
      brand: input.brand?.trim() || null,
      description: input.description?.trim() || null,
      foundAirport,
      foundAt: this.clock.now(),
      source: 'staff',
      status: 'held',
      recordedBy: staffId,
      createdAt: now,
      updatedAt: now,
    }

    const saved = await this.repository.create(bag)

    for (const listener of this.listeners) {
      await listener.onFoundBagRecorded(saved, checkedBag)
    }

    return saved
  }

  async getById(id: string): Promise<FoundBag> {
    const bag = await this.repository.findById(id)

    if (!bag) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.FOUND_BAG_NOT_FOUND, 'Found bag not found')
    }

    return bag
  }

  list(filter: FoundBagFilter = {}): Promise<FoundBag[]> {
    return this.repository.list({
      ...filter,
      tagNumber: filter.tagNumber?.trim() || undefined,
      foundAirport: filter.foundAirport?.trim().toUpperCase() || undefined,
    })
  }
}
