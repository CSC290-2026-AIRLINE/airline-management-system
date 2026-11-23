// Purchase receipt test: a delivered batch with no expiry gets one from the product's shelf life, counted from the
// received time (which comes from F12's clock, not the browser), and duty-free gets none.

import { defaultExpiry } from './purchase-receipts.service'

jest.mock('../../../db/db.service', () => ({ DbService: class {} }))

const RECEIVED = new Date('2026-11-25T17:00:00Z')

describe('defaultExpiry', () => {
  it('is the received time plus the shelf life', () => {
    expect(defaultExpiry({ category: 'meal', shelf_life_days: 2 }, RECEIVED)?.toISOString()).toBe('2026-11-27T17:00:00.000Z')
    expect(defaultExpiry({ category: 'beverage', shelf_life_days: 30 }, RECEIVED)?.toISOString()).toBe('2026-12-25T17:00:00.000Z')
  })

  it('is null for duty-free, for a product with no shelf life, and for an unknown product', () => {
    expect(defaultExpiry({ category: 'duty_free', shelf_life_days: null }, RECEIVED)).toBeNull()
    expect(defaultExpiry({ category: 'snack', shelf_life_days: null }, RECEIVED)).toBeNull()
    expect(defaultExpiry(undefined, RECEIVED)).toBeNull()
  })
})
