// StockTransfersService test: moving the catering order to the aircraft
// gives back the warehouse reservation of the flight's paid orders.
// Before, quantity_on_hand dropped but quantity_reserved kept the
// units, so available stock went negative after every flight.

import type { DbService } from '../../../db/db.service'
import type { AuditService } from '../common/audit.service'
import type { ReservationsService } from '../common/reservations.service'
import { StockTransfersService } from './stock-transfers.service'

jest.mock('../../../db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-23T10:00:00Z')

const INPUT = {
  flightId: 'flight-1',
  aircraftId: 'aircraft-1',
  warehouseId: 'wh-1',
  lines: [{ productId: 'meal-a', quantity: 5 }],
  staffId: 'staff-1',
  occurredAt: NOW,
}

const paidOrder = (id: string, lines: Array<{ product_id: string; quantity: number }>) => ({ id, product_order_line: lines })

function setup(opts: { paidOrders?: unknown[]; released?: unknown[]; alreadyTransferred?: unknown[] } = {}) {
  const tx = {
    stock_transfer: {
      create: jest.fn().mockResolvedValue({
        id: 'transfer-1',
        flight_id: 'flight-1',
        aircraft_id: 'aircraft-1',
        warehouse_id: 'wh-1',
        transferred_at: NOW,
        staff_id: 'staff-1',
      }),
    },
    stock_batch: {
      findMany: jest.fn().mockResolvedValue([{ id: 'batch-1', quantity_remaining: 50, is_damaged: false, expires_at: null }]),
      update: jest.fn(),
    },
    warehouse_stock: { update: jest.fn() },
    aircraft_stock: { upsert: jest.fn() },
    stock_transfer_line: { create: jest.fn().mockResolvedValue({ id: 'stl-1' }) },
    stock_movement: { create: jest.fn(), findMany: jest.fn().mockResolvedValue(opts.released ?? []) },
    product_order: { findMany: jest.fn().mockResolvedValue(opts.paidOrders ?? []) },
  }
  const db = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    stock_transfer_line: { findMany: jest.fn().mockResolvedValue(opts.alreadyTransferred ?? []) },
    // The earlier transfer, returned when a retry has nothing to move.
    stock_transfer: {
      findMany: jest.fn().mockResolvedValue(
        opts.alreadyTransferred
          ? [
              {
                id: 'transfer-0',
                flight_id: 'flight-1',
                aircraft_id: 'aircraft-1',
                warehouse_id: 'wh-1',
                transferred_at: NOW,
                staff_id: 'staff-1',
                stock_transfer_line: [],
              },
            ]
          : [],
      ),
    },
  }
  const reservations = { release: jest.fn().mockResolvedValue(true) }
  const service = new StockTransfersService(
    db as unknown as DbService,
    { record: jest.fn() } as unknown as AuditService,
    { now: () => NOW },
    reservations as unknown as ReservationsService,
  )
  return { service, tx, reservations }
}

describe('StockTransfersService reservation release', () => {
  it('releases the reservation of every paid order for the moved products', async () => {
    const { service, reservations } = setup({
      paidOrders: [
        paidOrder('order-1', [
          { product_id: 'meal-a', quantity: 2 },
          { product_id: 'meal-a', quantity: 1 },
        ]),
        paidOrder('order-2', [{ product_id: 'snack-b', quantity: 4 }]),
      ],
    })

    await service.transferToAircraft(INPUT)

    // order-2's product was not moved, so its stock stays held.
    expect(reservations.release).toHaveBeenCalledTimes(1)
    expect(reservations.release).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ warehouseId: 'wh-1', productId: 'meal-a', quantity: 3, orderId: 'order-1', flightId: 'flight-1' }),
    )
  })

  it('skips an order whose reservation was already released, so the transaction is not aborted', async () => {
    const { service, reservations } = setup({
      paidOrders: [paidOrder('order-1', [{ product_id: 'meal-a', quantity: 2 }])],
      released: [{ product_order_id: 'order-1', product_id: 'meal-a' }],
    })

    await service.transferToAircraft(INPUT)

    expect(reservations.release).not.toHaveBeenCalled()
  })

  it('moves and releases nothing on a retry once everything is on the aircraft', async () => {
    const { service, tx, reservations } = setup({
      paidOrders: [paidOrder('order-1', [{ product_id: 'meal-a', quantity: 2 }])],
      alreadyTransferred: [{ product_id: 'meal-a', quantity: 5 }],
    })

    await service.transferToAircraft(INPUT)

    expect(tx.stock_transfer.create).not.toHaveBeenCalled()
    expect(reservations.release).not.toHaveBeenCalled()
  })
})
