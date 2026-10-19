// PurchaseReceiptsService: receive-delivery. Every line creates a
// stock_batch row (quantity_remaining = quantity_received) and bumps
// warehouse_stock.quantity_on_hand. The whole transaction is atomic
// so a partial receipt never lands. Audit row is written inside the
// same transaction.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { AuditService } from '../common/audit.service'
import { toNumber } from '../common/mapping'

export interface PurchaseReceiptLineDto {
  productId: string
  productName: string
  quantity: number
  unitCostAmount: number
  batchCode: string
  expiresAt: string | null
  lineTotal: number
}

export interface PurchaseReceiptDto {
  id: string
  supplierId: string
  warehouseId: string
  receivedAt: string
  receivedByStaffId: string | null
  lines: PurchaseReceiptLineDto[]
}

export interface PurchaseReceiptLineInput {
  productId: string
  quantity: number
  unitCostAmount: number
  batchCode: string
  expiresAt: string | null
}

export interface CreatePurchaseReceiptInput {
  supplierId: string
  warehouseId: string
  receivedAt?: string
  lines: PurchaseReceiptLineInput[]
}

@Injectable()
export class PurchaseReceiptsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async list(filter: { warehouseId?: string; supplierId?: string } = {}): Promise<PurchaseReceiptDto[]> {
    const rows = await this.db.purchase_receipt.findMany({
      where: {
        ...(filter.warehouseId ? { warehouse_id: filter.warehouseId } : {}),
        ...(filter.supplierId ? { supplier_id: filter.supplierId } : {}),
      },
      include: { stock_batch: { include: { product: true } } },
      orderBy: { received_at: 'desc' },
    })
    return rows.map((r) => this.toDto(r))
  }

  async create(input: CreatePurchaseReceiptInput, staffId: string): Promise<PurchaseReceiptDto> {
    if (!input.lines || input.lines.length === 0) {
      throw new ApiErrorException('EMPTY_RECEIPT', 'Receipt must have at least one line.', 400)
    }
    const warehouse = await this.db.warehouse.findFirst({ where: { id: input.warehouseId, deleted_at: null } })
    if (!warehouse) throw new ApiErrorException('WAREHOUSE_INVALID', 'Warehouse not found.', 400)
    const supplier = await this.db.supplier.findFirst({ where: { id: input.supplierId, deleted_at: null } })
    if (!supplier) throw new ApiErrorException('SUPPLIER_INVALID', 'Supplier not found.', 400)
    if (supplier.airport_code !== warehouse.airport_code) {
      throw new ApiErrorException('SUPPLIER_INVALID', 'Supplier does not serve the warehouse airport.', 400)
    }
    // Validate every line and gather product info.
    const seenProducts = new Set<string>()
    const productIds = new Set<string>()
    for (const line of input.lines) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new ApiErrorException('LINE_INVALID', 'quantity must be a positive integer.', 400)
      }
      if (!Number.isFinite(line.unitCostAmount) || line.unitCostAmount < 0) {
        throw new ApiErrorException('LINE_INVALID', 'unitCostAmount must be >= 0.', 400)
      }
      if (!line.batchCode || line.batchCode.trim().length === 0) {
        throw new ApiErrorException('LINE_INVALID', 'batchCode is required.', 400)
      }
      if (line.expiresAt != null) {
        const t = Date.parse(line.expiresAt)
        if (Number.isNaN(t)) throw new ApiErrorException('LINE_INVALID', 'expiresAt must be ISO date.', 400)
      }
      if (seenProducts.has(line.productId)) {
        throw new ApiErrorException('DUPLICATE_PRODUCT', `Product ${line.productId} appears more than once.`, 400)
      }
      seenProducts.add(line.productId)
      productIds.add(line.productId)
    }
    const products = await this.db.product.findMany({
      where: { id: { in: [...productIds] }, deleted_at: null },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))
    for (const id of productIds) {
      if (!productMap.has(id)) throw new ApiErrorException('NOT_FOUND', `Product ${id} not found.`, 404)
    }

    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date()
    if (Number.isNaN(receivedAt.getTime())) {
      throw new ApiErrorException('LINE_INVALID', 'receivedAt must be ISO date.', 400)
    }

    const created = await this.db.$transaction(async (tx) => {
      const receipt = await tx.purchase_receipt.create({
        data: {
          supplier_id: input.supplierId,
          warehouse_id: input.warehouseId,
          received_at: receivedAt,
          received_by_staff_id: staffId,
        },
      })
      for (const line of input.lines) {
        const product = productMap.get(line.productId)!
        await tx.stock_batch.create({
          data: {
            purchase_receipt_id: receipt.id,
            warehouse_id: input.warehouseId,
            product_id: line.productId,
            batch_code: line.batchCode,
            quantity_received: line.quantity,
            quantity_remaining: line.quantity,
            unit_cost_amount: line.unitCostAmount,
            received_at: receivedAt,
            expires_at: line.expiresAt ? new Date(line.expiresAt) : null,
          },
        })
        await tx.warehouse_stock.upsert({
          where: { warehouse_id_product_id: { warehouse_id: input.warehouseId, product_id: line.productId } },
          create: {
            warehouse_id: input.warehouseId,
            product_id: line.productId,
            quantity_on_hand: line.quantity,
            quantity_reserved: 0,
            reorder_level: 0,
          },
          update: { quantity_on_hand: { increment: line.quantity } },
        })
        await tx.stock_movement.create({
          data: {
            product_id: line.productId,
            warehouse_id: input.warehouseId,
            stock_batch_id: undefined, // set after batch create; we re-use the create result below
            type: 'receive',
            quantity: line.quantity,
            reason: null,
            note: null,
            created_by_staff_id: staffId,
            occurred_at: receivedAt,
          },
        })
        // Re-do the movement so the stock_batch_id is filled. Pull the
        // latest batch row (id is uuid, fresh each create).
        const latestBatch = await tx.stock_batch.findFirstOrThrow({
          where: { purchase_receipt_id: receipt.id, product_id: line.productId, batch_code: line.batchCode },
          orderBy: { received_at: 'desc' },
        })
        await tx.stock_movement.updateMany({
          where: {
            warehouse_id: input.warehouseId,
            product_id: line.productId,
            type: 'receive',
            stock_batch_id: null,
            occurred_at: receivedAt,
          },
          data: { stock_batch_id: latestBatch.id },
        })
        void product // mark used
      }
      await this.audit.record(
        {
          actorType: 'staff',
          actorId: staffId,
          actorRole: 'catering',
          sourceFeature: 'onboard-products',
          action: 'purchase_receipt.create',
          entityType: 'purchase_receipt',
          entityId: receipt.id,
          summary: `Received delivery: ${input.lines.length} line(s) at warehouse ${input.warehouseId}.`,
        },
        tx,
      )
      return tx.purchase_receipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: { stock_batch: { include: { product: true } } },
      })
    })
    return this.toDto(created)
  }

  private toDto(row: {
    id: string
    supplier_id: string
    warehouse_id: string
    received_at: Date
    received_by_staff_id: string | null
    stock_batch: Array<{
      id: string
      product_id: string
      batch_code: string
      quantity_received: number
      unit_cost_amount: { toNumber: () => number } | number | string
      expires_at: Date | null
      product: { name: string }
    }>
  }): PurchaseReceiptDto {
    return {
      id: row.id,
      supplierId: row.supplier_id,
      warehouseId: row.warehouse_id,
      receivedAt: row.received_at.toISOString(),
      receivedByStaffId: row.received_by_staff_id,
      lines: row.stock_batch.map((b) => ({
        productId: b.product_id,
        productName: b.product.name,
        quantity: b.quantity_received,
        unitCostAmount: toNumber(b.unit_cost_amount),
        batchCode: b.batch_code,
        expiresAt: b.expires_at ? b.expires_at.toISOString() : null,
        lineTotal: b.quantity_received * toNumber(b.unit_cost_amount),
      })),
    }
  }
}
