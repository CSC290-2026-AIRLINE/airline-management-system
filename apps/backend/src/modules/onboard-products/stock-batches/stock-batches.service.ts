// StockBatchesService: read + write-off. Write-off moves
// quantity_remaining -> 0 for any non-damaged batch whose expires_at
// is in the past, and appends one stock_movement per batch with
// type=discard, reason=expired. Idempotent: re-running on an
// already-zeroed batch is a no-op.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { AuditService } from '../common/audit.service'
import { SystemClock } from '../common/clock'
import { toNumber } from '../common/mapping'

export interface StockBatchDto {
  id: string
  purchaseReceiptId: string
  warehouseId: string
  productId: string
  batchCode: string
  quantityReceived: number
  quantityRemaining: number
  unitCostAmount: number
  receivedAt: string
  expiresAt: string | null
  isDamaged: boolean
}

@Injectable()
export class StockBatchesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly clock: SystemClock,
  ) {}

  async list(filter: { warehouseId?: string; productId?: string; expiringBefore?: Date }): Promise<StockBatchDto[]> {
    const where: Record<string, unknown> = {}
    if (filter.warehouseId) where.warehouse_id = filter.warehouseId
    if (filter.productId) where.product_id = filter.productId
    if (filter.expiringBefore) where.expires_at = { lte: filter.expiringBefore }
    const rows = await this.db.stock_batch.findMany({
      where,
      orderBy: [{ warehouse_id: 'asc' }, { expires_at: 'asc' }],
    })
    return rows.map(this.toDto)
  }

  async writeOffExpired(filter: { warehouseId?: string; productId?: string }, staffId: string): Promise<StockBatchDto[]> {
    const now = this.clock.now()
    const where: Record<string, unknown> = {
      expires_at: { lte: now },
      is_damaged: false,
      quantity_remaining: { gt: 0 },
    }
    if (filter.warehouseId) where.warehouse_id = filter.warehouseId
    if (filter.productId) where.product_id = filter.productId
    const rows = await this.db.stock_batch.findMany({ where })
    if (rows.length === 0) return []
    return this.db.$transaction(async (tx) => {
      const writtenOff: StockBatchDto[] = []
      for (const batch of rows) {
        await tx.stock_batch.update({ where: { id: batch.id }, data: { quantity_remaining: 0 } })
        await tx.warehouse_stock.update({
          where: { warehouse_id_product_id: { warehouse_id: batch.warehouse_id, product_id: batch.product_id } },
          data: { quantity_on_hand: { decrement: batch.quantity_remaining } },
        })
        await tx.stock_movement.create({
          data: {
            product_id: batch.product_id,
            warehouse_id: batch.warehouse_id,
            stock_batch_id: batch.id,
            type: 'discard',
            quantity: -batch.quantity_remaining,
            reason: 'expired',
            note: 'auto write-off: batch expired',
            created_by_staff_id: staffId,
            occurred_at: now,
          },
        })
        writtenOff.push(this.toDto({ ...batch, quantity_remaining: 0 }))
      }
      await this.audit.record(
        {
          actorType: 'staff',
          actorId: staffId,
          actorRole: 'catering',
          sourceFeature: 'onboard-products',
          action: 'stock_batch.write_off_expired',
          entityType: 'stock_batch',
          entityId: null,
          summary: `Wrote off ${rows.length} expired batch(es).`,
        },
        tx,
      )
      return writtenOff
    })
  }

  private toDto = (row: {
    id: string
    purchase_receipt_id: string
    warehouse_id: string
    product_id: string
    batch_code: string
    quantity_received: number
    quantity_remaining: number
    unit_cost_amount: { toNumber: () => number } | number | string
    received_at: Date
    expires_at: Date | null
    is_damaged: boolean
  }): StockBatchDto => ({
    id: row.id,
    purchaseReceiptId: row.purchase_receipt_id,
    warehouseId: row.warehouse_id,
    productId: row.product_id,
    batchCode: row.batch_code,
    quantityReceived: row.quantity_received,
    quantityRemaining: row.quantity_remaining,
    unitCostAmount: toNumber(row.unit_cost_amount),
    receivedAt: row.received_at.toISOString(),
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    isDamaged: row.is_damaged,
  })
}
