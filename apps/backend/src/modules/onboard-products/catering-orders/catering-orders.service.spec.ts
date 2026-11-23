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
const NO_DEFAULT_MEALS = new Proxy({}, { get: () => ({ mealService: 'none', includedPerPassenger: 0 }) })

function setup(opts: { stock: unknown[]; transferred: unknown[] }) {
  const db = {
    product_order: {
      findMany: jest.fn().mockResolvedValue([
        { cabin: 'economy', product_order_line: [{ product_id: 'meal-a', quantity: 3 }] },
        { cabin: 'business', product_order_line: [{ product_id: 'meal-a', quantity: 2 }] },
      ]),
    },
    warehouse_stock: { findMany: jest.fn().mockResolvedValue(opts.stock) },
    stock_transfer_line: { findMany: jest.fn().mockResolvedValue(opts.transferred) },
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
  jest.spyOn(internals, 'passengerSummary').mockResolvedValue(new Map())
  jest.spyOn(internals, 'defaultOfferings').mockResolvedValue(new Map())
  return () => internals.buildLines('flight-1', 'route-1', 'wh-1', NO_DEFAULT_MEALS)
}

const shorts = (lines: LineDraft[]) => lines.map((l) => [l.cabin, l.quantityShort])

describe('CateringOrdersService shortage count', () => {
  it('counts stock already on the aircraft, so a recount after the transfer is not short', async () => {
    // Everything moved: the warehouse row is empty and the reservation released.
    const buildLines = setup({
      stock: [{ product_id: 'meal-a', quantity_on_hand: 0, quantity_reserved: 0 }],
      transferred: [{ product_id: 'meal-a', quantity: 5 }],
    })
    expect(shorts(await buildLines())).toEqual([
      ['economy', 0],
      ['business', 0],
    ])
  })

  it('pools a product across lines, so two lines cannot claim the same units', async () => {
    const buildLines = setup({
      stock: [{ product_id: 'meal-a', quantity_on_hand: 4, quantity_reserved: 0 }],
      transferred: [],
    })
    expect(shorts(await buildLines())).toEqual([
      ['economy', 0],
      ['business', 1],
    ])
  })
})
