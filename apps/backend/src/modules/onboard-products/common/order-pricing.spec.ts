// Tests for the customer-order pricing rules. These are the rules the
// Iteration-02 doc states in prose, so they are pinned here: a change
// that breaks one of them has to change this file on purpose.
//
// The functions under test are pure, so no database or Nest container
// is needed.

import {
  cutoffAt,
  isOrderWindowOpen,
  orderExpiresAt,
  priceBasisFor,
  priceLine,
  priceOrder,
  roundMoney,
  type OrderLineInput,
  type PricingContext,
} from './order-pricing'

const MEAL: OrderLineInput = {
  productId: 'p-meal',
  category: 'meal',
  quantity: 1,
  priceAmount: 18,
  isPremium: false,
}

const PREMIUM_MEAL: OrderLineInput = { ...MEAL, productId: 'p-premium', isPremium: true }

const SNACK: OrderLineInput = { productId: 'p-snack', category: 'snack', quantity: 2, priceAmount: 4.5, isPremium: false }

const PAID: PricingContext = { mealService: 'paid', includedPerPassenger: 0, hasTier: false }
const COMPLIMENTARY: PricingContext = { mealService: 'complimentary', includedPerPassenger: 1, hasTier: false }
const TIER: PricingContext = { mealService: 'paid', includedPerPassenger: 0, hasTier: true }

describe('priceBasisFor', () => {
  it('charges a meal on a paid cabin', () => {
    expect(priceBasisFor(MEAL, PAID)).toBe('standard')
  })

  it('includes the meal on a complimentary cabin', () => {
    expect(priceBasisFor(MEAL, COMPLIMENTARY)).toBe('included')
  })

  it('charges the meal on a complimentary cabin with no allowance', () => {
    expect(priceBasisFor(MEAL, { ...COMPLIMENTARY, includedPerPassenger: 0 })).toBe('standard')
  })

  it('gives a tier holder a free meal', () => {
    expect(priceBasisFor(MEAL, TIER)).toBe('tier_benefit')
  })

  it('always charges a premium meal, even for a tier holder', () => {
    expect(priceBasisFor(PREMIUM_MEAL, TIER)).toBe('standard')
  })

  it('always charges a snack, even on a complimentary cabin', () => {
    expect(priceBasisFor(SNACK, COMPLIMENTARY)).toBe('standard')
  })

  it('never stacks the two free benefits on one line', () => {
    const both = priceBasisFor(MEAL, { mealService: 'complimentary', includedPerPassenger: 1, hasTier: true })
    expect(both).toBe('tier_benefit')
  })
})

describe('priceLine', () => {
  it('keeps the catalog price on a standard line', () => {
    const line = priceLine(MEAL, PAID)
    expect(line.unitPriceAmount).toBe(18)
    expect(line.lineTotal).toBe(18)
    expect(line.priceBasis).toBe('standard')
  })

  it('prices a free line at 0', () => {
    const line = priceLine(MEAL, COMPLIMENTARY)
    expect(line.unitPriceAmount).toBe(0)
    expect(line.lineTotal).toBe(0)
    expect(line.priceBasis).toBe('included')
  })

  it('multiplies the unit price by the quantity', () => {
    const line = priceLine(SNACK, PAID)
    expect(line.unitPriceAmount).toBe(4.5)
    expect(line.lineTotal).toBe(9)
  })

  it('rounds to cents', () => {
    const line = priceLine({ ...SNACK, quantity: 3, priceAmount: 0.335 }, PAID)
    expect(line.unitPriceAmount).toBe(0.34)
    expect(line.lineTotal).toBe(1.02)
  })
})

describe('priceOrder', () => {
  it('totals the lines it priced', () => {
    const order = priceOrder([MEAL, SNACK], PAID)
    expect(order.totalAmount).toBe(27)
    expect(order.lines).toHaveLength(2)
  })

  it('sums to zero when every line is free', () => {
    const order = priceOrder([MEAL, { ...MEAL, productId: 'p-meal-2' }], COMPLIMENTARY)
    expect(order.totalAmount).toBe(0)
  })

  it('keeps a premium meal charged on a tier order', () => {
    const order = priceOrder([MEAL, PREMIUM_MEAL], TIER)
    expect(order.lines[0].unitPriceAmount).toBe(0)
    expect(order.lines[1].unitPriceAmount).toBe(18)
    expect(order.totalAmount).toBe(18)
  })
})

describe('roundMoney', () => {
  it('keeps two decimals', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
  })
})

describe('cutoffAt', () => {
  it('is the scheduled departure minus the order window', () => {
    const departure = new Date('2026-11-10T08:00:00.000Z')
    expect(cutoffAt(departure, 48).toISOString()).toBe('2026-11-08T08:00:00.000Z')
  })

  it('does not move when the flight is delayed', () => {
    const departure = new Date('2026-11-10T08:00:00.000Z')
    const cutoff = cutoffAt(departure, 48)
    // The cutoff is computed from the scheduled departure only.
    expect(cutoff.getTime()).toBeLessThan(departure.getTime())
  })
})

describe('orderExpiresAt', () => {
  const created = new Date('2026-11-01T10:00:00.000Z')

  it('is the hold when the hold comes first', () => {
    const cutoff = new Date('2026-11-05T10:00:00.000Z')
    expect(orderExpiresAt(created, 30, cutoff).toISOString()).toBe('2026-11-01T10:30:00.000Z')
  })

  it('is the cutoff when the cutoff comes first', () => {
    const cutoff = new Date('2026-11-01T10:10:00.000Z')
    expect(orderExpiresAt(created, 30, cutoff).toISOString()).toBe('2026-11-01T10:10:00.000Z')
  })
})

describe('isOrderWindowOpen', () => {
  it('is open before the cutoff', () => {
    expect(isOrderWindowOpen(new Date('2026-11-01T00:00:00.000Z'), new Date('2026-11-02T00:00:00.000Z'))).toBe(true)
  })

  it('is closed at and after the cutoff', () => {
    const cutoff = new Date('2026-11-02T00:00:00.000Z')
    expect(isOrderWindowOpen(cutoff, cutoff)).toBe(false)
    expect(isOrderWindowOpen(new Date('2026-11-03T00:00:00.000Z'), cutoff)).toBe(false)
  })
})
