// StockBatchesService test: writing off an expired batch lowers on hand
// and, in the same statement, caps reserved at what is left. A separate
// on-hand decrement broke the reserved <= on hand check whenever orders
// held the expired stock, which failed the whole write-off every tick.

import type { DbService } from '../../../db/db.service'
import type { AuditService } from '../common/audit.service'
import { StockBatchesService } from './stock-batches.service'

jest.mock('../../../db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-26T03:00:00Z')

const expiredBatch = {
  id: 'batch-1',
  purchase_receipt_id: 'receipt-1',
  warehouse_id: 'wh-1',
  product_id: 'meal-a',
  batch_code: 'B1',
  quantity_received: 10,
  quantity_remaining: 7,
  unit_cost_amount: 50,
  received_at: new Date('2026-11-01T00:00:00Z'),
  expires_at: new Date('2026-11-25T00:00:00Z'),
  is_damaged: false,
}

function setup() {
  const tx = {
    stock_batch: { update: jest.fn() },
    warehouse_stock: { update: jest.fn() },
    stock_movement: { create: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1),
  }
  const db = {
    stock_batch: { findMany: jest.fn().mockResolvedValue([expiredBatch]) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  const audit = { record: jest.fn() }
  const service = new StockBatchesService(db as unknown as DbService, audit as unknown as AuditService, { now: () => NOW })
  return { service, tx, audit }
}

describe('StockBatchesService.writeOffExpired', () => {
  it('lowers on hand and caps reserved in one statement', async () => {
    const { service, tx } = setup()

    const written = await service.writeOffExpired({}, null)

    expect(written.map((b) => b.quantityRemaining)).toEqual([0])
    expect(tx.warehouse_stock.update).not.toHaveBeenCalled()
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    const [sqlParts, ...values] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    const sql = sqlParts.join('?')
    expect(sql).toContain('quantity_on_hand = quantity_on_hand - ?')
    expect(sql).toContain('quantity_reserved = LEAST(quantity_reserved, quantity_on_hand - ?)')
    expect(values).toEqual([7, 7, 'wh-1', 'meal-a'])
  })

  it('audits the scheduled job as the system, since it has no staff id', async () => {
    const { service, audit } = setup()

    await service.writeOffExpired({}, null)

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'system', actorId: null, actorRole: null }),
      expect.anything(),
    )
  })

  it('records the discard movement for the expired quantity', async () => {
    const { service, tx } = setup()

    await service.writeOffExpired({}, null)

    expect(tx.stock_movement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ stock_batch_id: 'batch-1', type: 'discard', quantity: -7, reason: 'expired' }),
    })
  })
})
