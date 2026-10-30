import type { FoundBagFilter, FoundBagRepository } from '../common/found-bag.ports'
import type { FoundBag } from '../common/found-bag.types'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from '../common/found-bag.errors'

export class InMemoryFoundBagRepository implements FoundBagRepository {
  private readonly bags: FoundBag[] = []

  async create(bag: FoundBag): Promise<FoundBag> {
    // Mirrors the UNIQUE constraint on found_bag.checked_bag_id.
    if (bag.checkedBagId && (await this.findByCheckedBagId(bag.checkedBagId))) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.FOUND_BAG_EXISTS, 'This checked bag is already recorded as found')
    }

    this.bags.push({ ...bag })
    return { ...bag }
  }

  findById(id: string): Promise<FoundBag | null> {
    const bag = this.bags.find((item) => item.id === id)

    return Promise.resolve(bag ? { ...bag } : null)
  }

  findByCheckedBagId(checkedBagId: string): Promise<FoundBag | null> {
    const bag = this.bags.find((item) => item.checkedBagId === checkedBagId)

    return Promise.resolve(bag ? { ...bag } : null)
  }

  list(filter: FoundBagFilter): Promise<FoundBag[]> {
    const bags = this.bags
      .filter(
        (item) =>
          (!filter.tagNumber || item.tagNumber === filter.tagNumber) &&
          (!filter.status || item.status === filter.status) &&
          (!filter.foundAirport || item.foundAirport === filter.foundAirport) &&
          (!filter.flightId || item.flightId === filter.flightId),
      )
      .map((bag) => ({ ...bag }))

    return Promise.resolve(bags)
  }
}
