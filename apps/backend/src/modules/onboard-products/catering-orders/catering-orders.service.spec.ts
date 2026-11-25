// CateringOrdersService test: the shortage count. Stock already moved to
// the aircraft for the flight counts as covered, so a refresh after the
// transfer does not mark a fully stocked order short (which then made a
// retried transfer fail with STOCK_SHORTFALL). Stock is pooled per
// product across the order's lines.

import type { DbService } from '../../../db/db.service'
import type { AuditService } from '../common/audit.service'
import type { FlightContextService } from '../common/flight-context.service'
import type { CabinSettingsService } from '../cabin-settings/cabin-settings.service'
import { CateringOrdersService } from './catering-orders.service'

jest.mock('../../../db/db.service', () => ({ DbService: class {} }))

interface LineDraft {
  cabin: string
  productId: string
  quantityRequired: number
  quantityShort: number
  source: 'order' | 'default'
}

// No cabin serves a complimentary meal, so only the paid orders make lines.
const NO_DEFAULT_MEALS = new Proxy({}, { get: () => ({ mealService: 'none', includedPerPassenger: 0, onboardBufferPercent: 0 }) })

interface SetupOptions {
  stock: unknown[]
  transferred: unknown[]
  released?: unknown[]
  orders?: unknown[]
  resolved?: unknown
  perCabin?: Record<string, { passengers: number; ordered: number }>
  defaults?: Record<string, string>
}

const PAID_ORDERS = [
  { id: 'order-1', cabin: 'economy', product_order_line: [{ product_id: 'meal-a', quantity: 3 }] },
  { id: 'order-2', cabin: 'business', product_order_line: [{ product_id: 'meal-a', quantity: 2 }] },
]

function setup(opts: SetupOptions) {
  const db = {
    product_order: { findMany: jest.fn().mockResolvedValue(opts.orders ?? PAID_ORDERS) },
    warehouse_stock: { findMany: jest.fn().mockResolvedValue(opts.stock) },
    stock_transfer_line: { findMany: jest.fn().mockResolvedValue(opts.transferred) },
    stock_movement: { findMany: jest.fn().mockResolvedValue(opts.released ?? []) },
  }
  const service = new CateringOrdersService(
    db as unknown as DbService,
    {} as AuditService,
    { now: () => new Date() },
    {} as CabinSettingsService,
    {} as FlightContextService,
  )
  const internals = service as unknown as {
    passengerSummary: () => Promise<Map<string, unknown>>
    defaultOfferings: () => Promise<Map<string, string>>
    buildLines: (flightId: string, routeId: string, warehouseId: string, resolved: unknown) => Promise<LineDraft[]>
  }
  const perCabin = new Map(Object.entries(opts.perCabin ?? {}))
  jest.spyOn(internals, 'passengerSummary').mockResolvedValue(new Map([['flight-1', { passengers: 0, orderedMeals: 0, perCabin }]]))
  jest.spyOn(internals, 'defaultOfferings').mockResolvedValue(new Map(Object.entries(opts.defaults ?? {})))
  return () => internals.buildLines('flight-1', 'route-1', 'wh-1', opts.resolved ?? NO_DEFAULT_MEALS)
}

const shorts = (lines: LineDraft[]) => lines.map((l) => [l.cabin, l.quantityShort])

describe('CateringOrdersService shortage count', () => {
  it('counts stock already on the aircraft, so a recount after the transfer is not short', async () => {
    // Everything moved: the warehouse row is empty and the reservations released.
    const buildLines = setup({
      stock: [{ product_id: 'meal-a', quantity_on_hand: 0, quantity_reserved: 0 }],
      transferred: [{ product_id: 'meal-a', quantity: 5 }],
      released: [
        { product_order_id: 'order-1', product_id: 'meal-a' },
        { product_order_id: 'order-2', product_id: 'meal-a' },
      ],
    })
    expect(shorts(await buildLines())).toEqual([
      ['economy', 0],
      ['business', 0],
    ])
  })

  it('does not count paid orders short for the stock their own reservation holds', async () => {
    // All 5 units on hand are reserved by this flight's two paid orders.
    const buildLines = setup({
      stock: [{ product_id: 'meal-a', quantity_on_hand: 5, quantity_reserved: 5 }],
      transferred: [],
    })
    expect(shorts(await buildLines())).toEqual([
      ['economy', 0],
      ['business', 0],
    ])
  })

  it('pools a product across lines, so two lines cannot claim the same units', async () => {
    // Only 4 units are physically there (an expired batch cut the reservation).
    const buildLines = setup({
      stock: [{ product_id: 'meal-a', quantity_on_hand: 4, quantity_reserved: 4 }],
      transferred: [],
    })
    expect(shorts(await buildLines())).toEqual([
      ['economy', 0],
      ['business', 1],
    ])
  })
})

describe('CateringOrdersService default meals', () => {
  const settings = (economy: Record<string, unknown>) =>
    new Proxy(
      {},
      { get: (_t, cabin) => (cabin === 'economy' ? economy : { mealService: 'none', includedPerPassenger: 0, onboardBufferPercent: 0 }) },
    )

  it('plans the included meal for every complimentary passenger who ordered none', async () => {
    const buildLines = setup({
      orders: [],
      stock: [{ product_id: 'set-meal', quantity_on_hand: 100, quantity_reserved: 0 }],
      transferred: [],
      resolved: settings({ mealService: 'complimentary', includedPerPassenger: 1, onboardBufferPercent: 10 }),
      perCabin: { economy: { passengers: 12, ordered: 2 } },
      defaults: { economy: 'set-meal' },
    })
    expect((await buildLines()).map((l) => [l.cabin, l.productId, l.quantityRequired, l.source])).toEqual([
      ['economy', 'set-meal', 10, 'default'],
    ])
  })

  it('plans a buffer for on-board sales on a paid cabin, rounded up', async () => {
    const buildLines = setup({
      orders: [],
      stock: [{ product_id: 'set-meal', quantity_on_hand: 100, quantity_reserved: 0 }],
      transferred: [],
      resolved: settings({ mealService: 'paid', includedPerPassenger: 0, onboardBufferPercent: 10 }),
      perCabin: { economy: { passengers: 12, ordered: 0 } },
      defaults: { economy: 'set-meal' },
    })
    expect((await buildLines()).map((l) => [l.cabin, l.quantityRequired, l.source])).toEqual([['economy', 2, 'default']])
  })

  it('does not load a default meal when the only paid-cabin passenger preordered one', async () => {
    const buildLines = setup({
      orders: [
        {
          id: 'order-1',
          cabin: 'economy',
          product_order_line: [
            { product_id: 'set-meal', quantity: 1 },
            { product_id: 'water', quantity: 1 },
          ],
        },
      ],
      stock: [],
      transferred: [],
      resolved: settings({ mealService: 'paid', includedPerPassenger: 0, onboardBufferPercent: 10 }),
      perCabin: { economy: { passengers: 1, ordered: 1 } },
      defaults: { economy: 'set-meal' },
    })
    expect((await buildLines()).map((line) => [line.productId, line.quantityRequired, line.source])).toEqual([
      ['set-meal', 1, 'order'],
      ['water', 1, 'order'],
    ])
  })
})
