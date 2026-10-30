import type { CheckedBagDetailsLookup, CheckedBagRecord } from '../common/found-bag.ports'

export class MockCheckedBagDetailsLookup implements CheckedBagDetailsLookup {
  constructor(private readonly bags: readonly CheckedBagRecord[] = []) {}

  findByTag(tagNumber: string): Promise<CheckedBagRecord | null> {
    const bag = this.bags.find((item) => item.tagNumber === tagNumber)

    return Promise.resolve(bag ? { ...bag } : null)
  }
}
