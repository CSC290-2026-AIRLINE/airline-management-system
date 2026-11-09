// WarehouseStockService: the stock of a warehouse, per product.
//
//   on hand     - what the warehouse holds (quantity_on_hand)
//   reserved    - what the open customer orders hold (quantity_reserved)
//   available   - on hand minus reserved, what can still be picked
//   reorder     - the level below which the line counts as low
//
// The numbers come from warehouse_stock, so the Stock page shows the
// real stock instead of a guess.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'

export interface WarehouseStockLineDto {
  productId: string
  sku: string
  name: string
  category: string
  quantityOnHand: number
  quantityReserved: number
  availableQuantity: number
  reorderLevel: number
  isLow: boolean
}

export interface WarehouseStockDto {
  warehouseId: string
  code: string
  name: string
  airportCode: string
  lines: WarehouseStockLineDto[]
}

@Injectable()
export class WarehouseStockService {
  constructor(private readonly db: DbService) {}

  // The stock of one warehouse, or of every warehouse when no id is
  // given. With lowOnly set, only the lines at or below their reorder
  // level are returned.
  async list(warehouseId?: string, lowOnly = false): Promise<{ warehouses: WarehouseStockDto[] }> {
    if (warehouseId) {
      const found = await this.db.warehouse.findFirst({ where: { id: warehouseId, deleted_at: null } })
      if (!found) throw new ApiErrorException('NOT_FOUND', 'Warehouse not found.', 404)
    }
    const warehouses = await this.db.warehouse.findMany({
      where: { deleted_at: null, ...(warehouseId ? { id: warehouseId } : {}) },
      include: { warehouse_stock: { include: { product: true } } },
      orderBy: { code: 'asc' },
    })
    return {
      warehouses: warehouses.map((w) => {
        const lines = w.warehouse_stock.map((s) => this.toLine(s)).sort((a, b) => a.sku.localeCompare(b.sku))
        return {
          warehouseId: w.id,
          code: w.code,
          name: w.name,
          airportCode: w.airport_code,
          lines: lowOnly ? lines.filter((l) => l.isLow) : lines,
        }
      }),
    }
  }

  private toLine(row: {
    product_id: string
    quantity_on_hand: number
    quantity_reserved: number
    reorder_level: number
    product: { sku: string; name: string; category: string }
  }): WarehouseStockLineDto {
    const available = row.quantity_on_hand - row.quantity_reserved
    return {
      productId: row.product_id,
      sku: row.product.sku,
      name: row.product.name,
      category: row.product.category,
      quantityOnHand: row.quantity_on_hand,
      quantityReserved: row.quantity_reserved,
      availableQuantity: available,
      reorderLevel: row.reorder_level,
      isLow: available <= row.reorder_level,
    }
  }
}
