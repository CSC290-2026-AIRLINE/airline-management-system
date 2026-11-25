// SchedulerService test: the job writes a flight's catering order once,
// at the cutoff, and never rewrites an existing one. Rewriting it every
// tick re-counted the shortage after the stock had moved to the aircraft
// and wrote an audit row each minute.

import { Logger } from '@nestjs/common'
import type { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import type { CateringOrdersService } from '../catering-orders/catering-orders.service'
import type { ProductOrdersService } from '../product-orders/product-orders.service'
import type { StockBatchesService } from '../stock-batches/stock-batches.service'
import { SchedulerService } from './scheduler.service'

jest.mock('../../../db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-23T10:00:00Z')

function setup(
  existingOrder: { id: string; status?: string; generated_at?: Date } | null,
  cutoff = new Date('2026-11-23T09:00:00Z'),
  cancelledFlights: Array<{ id: string; catering_order: { status: string } | null }> = [],
) {
  const db = {
    flight: {
      // The cancelled-flight query asks for status 'cancelled'; the generation query does not.
      findMany: jest.fn((args: { where: { status?: unknown } }) =>
        Promise.resolve(args.where.status === 'cancelled' ? cancelledFlights : [{ id: 'flight-1' }]),
      ),
    },
    catering_order: { findUnique: jest.fn().mockResolvedValue(existingOrder) },
    stock_transfer: { findFirst: jest.fn().mockResolvedValue(null) },
  }
  const cateringOrders = {
    cutoffFor: jest.fn().mockResolvedValue(cutoff),
    generate: jest.fn().mockResolvedValue({}),
    void: jest.fn().mockResolvedValue({}),
  }
  const productOrders = {
    expireUnpaidOrders: jest.fn().mockResolvedValue(0),
    cancelForCancelledFlight: jest.fn().mockResolvedValue(2),
  }
  const stockBatches = { writeOffExpired: jest.fn().mockResolvedValue([]) }
  const scheduler = new SchedulerService(
    db as unknown as DbService,
    { now: () => NOW },
    cateringOrders as unknown as CateringOrdersService,
    productOrders as unknown as ProductOrdersService,
    stockBatches as unknown as StockBatchesService,
  )
  return { scheduler, cateringOrders, productOrders }
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

  it('rebuilds an untransferred plan generated before the cutoff', async () => {
    const { scheduler, cateringOrders } = setup({
      id: 'early-order',
      status: 'generated',
      generated_at: new Date('2026-11-23T08:00:00Z'),
    })
    const result = await scheduler.tick()
    expect(cateringOrders.generate).toHaveBeenCalledWith('flight-1', null)
    expect(result.generated).toBe(1)
  })

  it('waits for the cutoff', async () => {
    const { scheduler, cateringOrders } = setup(null, new Date('2026-11-23T11:00:00Z'))
    await scheduler.tick()
    expect(cateringOrders.generate).not.toHaveBeenCalled()
  })

  it('skips a flight from an airport without an F12 warehouse without warning', async () => {
    const { scheduler, cateringOrders } = setup(null)
    cateringOrders.generate.mockRejectedValue(new ApiErrorException('NO_WAREHOUSE_FOR_AIRPORT', 'No warehouse is available at XXX.', 409))
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    const result = await scheduler.tick()

    expect(result.generated).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('still warns, with the F12 error code, on any other failure', async () => {
    const { scheduler, cateringOrders } = setup(null)
    cateringOrders.generate.mockRejectedValue(new ApiErrorException('NOT_FOUND', 'Flight not found.', 404))
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    await scheduler.tick()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NOT_FOUND: Flight not found.'))
    warn.mockRestore()
  })
})

describe('SchedulerService cancelled flights (doc step 10)', () => {
  it('cancels the open orders and voids a generated catering order of a flight F2 cancelled', async () => {
    const { scheduler, cateringOrders, productOrders } = setup({ id: 'order-x' }, undefined, [
      { id: 'flight-c', catering_order: { status: 'generated' } },
    ])

    const result = await scheduler.tick()

    expect(productOrders.cancelForCancelledFlight).toHaveBeenCalledWith('flight-c', NOW)
    expect(cateringOrders.void).toHaveBeenCalledWith('flight-c', null)
    expect(result.cancelled).toBe(2)
  })

  it('leaves a loaded catering order alone', async () => {
    const { scheduler, cateringOrders } = setup({ id: 'order-x' }, undefined, [{ id: 'flight-c', catering_order: { status: 'loaded' } }])

    await scheduler.tick()

    expect(cateringOrders.void).not.toHaveBeenCalled()
  })
})
