import type { CheckedBagLookup, CheckedBagOwnership } from '../common/report.ports'

export class MockCheckedBagLookup implements CheckedBagLookup {
  constructor(private readonly bags: readonly CheckedBagOwnership[] = []) {}

  findByTag(tagNumber: string): Promise<CheckedBagOwnership | null> {
    const bag = this.bags.find((item) => item.tagNumber === tagNumber)

    return Promise.resolve(bag ? { ...bag } : null)
  }
}
