// AircraftStockService: read aircraft stock with batch expiry joined
// in. Exposed to staff-web so the Flight Report can compute the
// "earliest-expiring valid batch" per product for unit-cost fill.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import type { Prisma } from '../../../db/generated/prisma/client'

export interface AircraftStockRowDto {
  id: string
  aircraftId: string
  productId: string
  productName: string
  stockBatchId: string
  batchCode: string
  quantity: number
  expiresAt: string | null
}

type RowWithBatch = Prisma.aircraft_stockGetPayload<{ include: { stock_batch: { include: { product: true } } } }>

@Injectable()
export class AircraftStockService {
  constructor(private readonly db: DbService) {}

  async list(aircraftId: string): Promise<AircraftStockRowDto[]> {
    const rows = (await this.db.aircraft_stock.findMany({
      where: { aircraft_id: aircraftId, quantity: { gt: 0 } },
      include: { stock_batch: { include: { product: true } } },
      orderBy: [{ stock_batch: { expires_at: 'asc' } }],
    })) as RowWithBatch[]
    return rows.map((r) => ({
      id: r.id,
      aircraftId: r.aircraft_id,
      productId: r.product_id,
      productName: r.stock_batch.product.name,
      stockBatchId: r.stock_batch_id,
      batchCode: r.stock_batch.batch_code,
      quantity: r.quantity,
      expiresAt: r.stock_batch.expires_at ? r.stock_batch.expires_at.toISOString() : null,
    }))
  }

  // Returns the earliest-expiring VALID (not expired, not damaged)
  // batch on the aircraft for a product, or null when nothing matches.
  // Used by the flight-report submit to fill product_sale.unit_cost.
  async earliestValidBatch(
    aircraftId: string,
    productId: string,
  ): Promise<{ stockBatchId: string; unitCostAmount: number; expiresAt: string | null } | null> {
    const now = new Date()
    const row = (await this.db.aircraft_stock.findFirst({
      where: { aircraft_id: aircraftId, product_id: productId, quantity: { gt: 0 } },
      include: { stock_batch: true },
      orderBy: [{ stock_batch: { expires_at: 'asc' } }],
    })) as (RowWithBatch & { stock_batch: RowWithBatch['stock_batch'] }) | null
    if (!row) return null
    if (row.stock_batch.is_damaged) return null
    if (row.stock_batch.expires_at && row.stock_batch.expires_at < now) return null
    return {
      stockBatchId: row.stock_batch_id,
      unitCostAmount: Number(row.stock_batch.unit_cost_amount),
      expiresAt: row.stock_batch.expires_at ? row.stock_batch.expires_at.toISOString() : null,
    }
  }
}
