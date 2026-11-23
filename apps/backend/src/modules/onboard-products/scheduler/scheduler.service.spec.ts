// SchedulerService test: the job writes a flight's catering order once,
// at the cutoff, and never rewrites an existing one. Rewriting it every
// tick re-counted the shortage after the stock had moved to the aircraft
// and wrote an audit row each minute.

import type { DbService } from '../../../db/db.service'
import type { CateringOrdersService } from '../catering-orders/catering-orders.service'
import type { ProductOrdersService } from '../product-orders/product-orders.service'
import type { StockBatchesService } from '../stock-batches/stock-batches.service'
import { SchedulerService } from './scheduler.service'

jest.mock('../../../db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-23T10:00:00Z')

function setup(existingOrder: { id: string } | null, cutoff = new Date('2026-11-23T09:00:00Z')) {
  const db = {
    flight: { findMany: jest.fn().mockResolvedValue([{ id: 'flight-1' }]) },
    catering_order: { findUnique: jest.fn().mockResolvedValue(existingOrder) },
  }
  const cateringOrders = {
    cutoffFor: jest.fn().mockResolvedValue(cutoff),
    generate: jest.fn().mockResolvedValue({}),
  }
  const productOrders = { expireUnpaidOrders: jest.fn().mockResolvedValue(0) }
  const stockBatches = { writeOffExpired: jest.fn().mockResolvedValue([]) }
  const scheduler = new SchedulerService(
    db as unknown as DbService,
    { now: () => NOW },
    cateringOrders as unknown as CateringOrdersService,
    productOrders as unknown as ProductOrdersService,
    stockBatches as unknown as StockBatchesService,
  )
  return { scheduler, cateringOrders }
}

describe('SchedulerService catering generation', () => {
  it('generates the order of a flight past its cutoff that has none yet', async () => {
    const { scheduler, cateringOrders } = setup(null)
    const result = await scheduler.tick()
    expect(cateringOrders.generate).toHaveBeenCalledWith('flight-1', null)
    expect(result.generated).toBe(1)
  })

  it('leaves an existing order alone on later ticks', async () => {
    const { scheduler, cateringOrders } = setup({ id: 'order-1' })
    const result = await scheduler.tick()
    expect(cateringOrders.generate).not.toHaveBeenCalled()
    expect(result.generated).toBe(0)
  })

  it('waits for the cutoff', async () => {
    const { scheduler, cateringOrders } = setup(null, new Date('2026-11-23T11:00:00Z'))
    await scheduler.tick()
    expect(cateringOrders.generate).not.toHaveBeenCalled()
  })
})
