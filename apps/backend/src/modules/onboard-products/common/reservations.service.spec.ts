// ReservationsService test: when a reservation must count only stock still valid at departure, and that it then
// uses the expiry-aware conditional update (and the plain one otherwise).

import type { DbService } from '../../../db/db.service'
import { ApiErrorException } from './api-error'
import { ReservationsService, validAtDepartureApplies, type ReservationTx } from './reservations.service'

jest.mock('../../../db/db.service', () => ({ DbService: class {} }))

describe('validAtDepartureApplies', () => {
  it('applies to products that outlive the order window, and to products with no expiry', () => {
    expect(validAtDepartureApplies(30, 48)).toBe(true) // a beverage
    expect(validAtDepartureApplies(null, 48)).toBe(true) // duty-free
  })

  it('does not apply to food that cannot outlive the window (supplied fresh for the flight)', () => {
    expect(validAtDepartureApplies(2, 48)).toBe(false) // a 2-day meal, 48 h window
    expect(validAtDepartureApplies(1, 48)).toBe(false)
  })
})

describe('ReservationsService.reserve', () => {
  const ARGS = { warehouseId: 'wh-1', productId: 'p-1', quantity: 2, orderId: 'o-1', flightId: 'f-1', occurredAt: new Date() }

  function setup(updated: number) {
    const tx = {
      stock_movement: { create: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(updated),
      warehouse_stock: { findUnique: jest.fn().mockResolvedValue({ quantity_on_hand: 10, quantity_reserved: 1 }) },
      stock_batch: { groupBy: jest.fn().mockResolvedValue([{ product_id: 'p-1', _sum: { quantity_remaining: 3 } }]) },
    }
    return { tx, service: new ReservationsService({} as DbService) }
  }

  const sqlOf = (tx: { $executeRaw: jest.Mock }) => (tx.$executeRaw.mock.calls[0][0] as TemplateStringsArray).join('?')

  it('counts only batches still valid at departure when validAt is given', async () => {
    const { tx, service } = setup(1)
    await service.reserve(tx as unknown as ReservationTx, { ...ARGS, validAt: new Date('2026-12-01T00:00:00Z') })
    expect(sqlOf(tx)).toContain('b.expires_at IS NULL OR b.expires_at > ?')
  })

  it('counts every unit on hand without validAt', async () => {
    const { tx, service } = setup(1)
    await service.reserve(tx as unknown as ReservationTx, ARGS)
    expect(sqlOf(tx)).not.toContain('stock_batch')
  })

  it('reports what is available at departure when it refuses', async () => {
    const { tx, service } = setup(0)
    const result = service.reserve(tx as unknown as ReservationTx, { ...ARGS, validAt: new Date('2026-12-01T00:00:00Z') })
    await expect(result).rejects.toBeInstanceOf(ApiErrorException)
    // 3 units valid at departure, 1 already reserved.
    await expect(result).rejects.toMatchObject({ response: { error: { code: 'OUT_OF_STOCK', details: { available: 2 } } } })
  })
})
