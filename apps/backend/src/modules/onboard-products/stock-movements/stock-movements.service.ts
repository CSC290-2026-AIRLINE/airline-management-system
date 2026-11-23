// StockMovementsService: read + adjust. "Adjust stock" decrements (or
// increments) warehouse_stock and the earliest-expiring batch for
// the product, then appends a stock_movement. The reason vocabulary
// matches the spec; REASON_REQUIRED is the error when the caller
// sends no reason.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { AuditService } from '../common/audit.service'
import { SystemClock } from '../common/clock'

export interface StockMovementDto {
  id: string
  productId: string
  warehouseId: string | null
  aircraftId: string | null
  stockBatchId: string | null
  stockTransferId: string | null
  productOrderId: string | null
  flightId: string | null
  type: string
  quantity: number
  reason: string | null
  note: string | null
  createdByStaffId: string | null
  occurredAt: string
}

export interface AdjustStockInput {
  warehouseId: string
  productId: string
  // Always positive; the API negates for outbound movements.
  quantity: number
  reason: 'spoilage' | 'damage' | 'expired' | 'count_correction'
  note: string | null
}

const REASONS = ['spoilage', 'damage', 'expired', 'count_correction'] as const

@Injectable()
export class StockMovementsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly clock: SystemClock,
  ) {}

  async list(filter: { warehouseId?: string; productId?: string; flightId?: string; limit?: number }): Promise<StockMovementDto[]> {
    const where: Record<string, unknown> = {}
    if (filter.warehouseId) where.warehouse_id = filter.warehouseId
    if (filter.productId) where.product_id = filter.productId
    if (filter.flightId) where.flight_id = filter.flightId
    const rows = await this.db.stock_movement.findMany({
      where,
      orderBy: { occurred_at: 'desc' },
      take: filter.limit ?? 200,
    })
    return rows.map(this.toDto)
  }

  // "Adjust stock": reduces (or increases) the earliest-expiring batch
  // for the product, never below zero. ADJUST_BELOW_RESERVED if the
  // net on-hand would drop below quantity_reserved.
  async adjust(input: AdjustStockInput, staffId: string): Promise<StockMovementDto> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new ApiErrorException('ADJUST_INVALID', 'quantity must be a positive integer.', 400)
    }
    if (!REASONS.includes(input.reason)) {
      throw new ApiErrorException('REASON_REQUIRED', 'reason is required (spoilage, damage, expired, count_correction).', 400)
    }
    const stock = await this.db.warehouse_stock.findUnique({
      where: { warehouse_id_product_id: { warehouse_id: input.warehouseId, product_id: input.productId } },
    })
    if (!stock) {
      throw new ApiErrorException('ADJUST_INVALID', 'Product is not stocked at this warehouse.', 404)
    }
    // For count_correction, the caller decides direction by signing the
    // note. To keep the API simple, we always treat the call as a
    // deduction: the spec's stock-movement type is "adjust" and the
    // amount is a positive loss for spoilage/damage/expired and a
    // signed correction otherwise.
    const signed = input.reason === 'count_correction' && (input.note ?? '').startsWith('+') ? input.quantity : -input.quantity
    if (stock.quantity_on_hand + signed < 0) {
      throw new ApiErrorException('ADJUST_INVALID', 'Adjustment would drive on-hand below zero.', 400)
    }
    if (stock.quantity_on_hand + signed < stock.quantity_reserved) {
      throw new ApiErrorException('ADJUST_BELOW_RESERVED', 'Cannot drop below the reserved quantity.', 409)
    }
    const now = this.clock.now()
    return this.db.$transaction(async (tx) => {
      // Find the earliest-expiring batch with quantity_remaining > 0.
      const batch = await tx.stock_batch.findFirst({
        where: { warehouse_id: input.warehouseId, product_id: input.productId, quantity_remaining: { gt: 0 } },
        orderBy: [{ expires_at: 'asc' }, { received_at: 'asc' }],
      })
      if (!batch && signed < 0) {
        throw new ApiErrorException('BATCH_SHORT', 'No batch with remaining quantity to deduct from.', 404)
      }
      if (batch && signed < 0) {
        const next = Math.max(0, batch.quantity_remaining + signed)
        await tx.stock_batch.update({ where: { id: batch.id }, data: { quantity_remaining: next } })
      }
      await tx.warehouse_stock.update({
        where: { warehouse_id_product_id: { warehouse_id: input.warehouseId, product_id: input.productId } },
        data: { quantity_on_hand: { increment: signed } },
      })
      const movement = await tx.stock_movement.create({
        data: {
          product_id: input.productId,
          warehouse_id: input.warehouseId,
          stock_batch_id: batch?.id ?? null,
          type: 'adjust',
          quantity: signed,
          reason: input.reason,
          note: input.note,
          created_by_staff_id: staffId,
          occurred_at: now,
        },
      })
      await this.audit.record(
        {
          actorType: 'staff',
          actorId: staffId,
          actorRole: 'catering',
          sourceFeature: 'onboard-products',
          action: 'stock_movement.adjust',
          entityType: 'stock_movement',
          entityId: movement.id,
          summary: `Adjusted ${input.productId} by ${signed} at warehouse ${input.warehouseId} (${input.reason}).`,
        },
        tx,
      )
      return this.toDto(movement)
    })
  }

  // Internal helper used by the transfer / aircraft-stock services:
  // append one movement row, optionally inside an existing transaction.
  // Returns nothing; callers already have the row they need.
  async appendInternal(
    tx: Parameters<Parameters<DbService['$transaction']>[0]>[0],
    data: {
      productId: string
      warehouseId?: string | null
      aircraftId?: string | null
      stockBatchId?: string | null
      stockTransferId?: string | null
      productOrderId?: string | null
      flightId?: string | null
      type: 'receive' | 'reserve' | 'release' | 'transfer' | 'discard' | 'adjust'
      quantity: number
      reason: 'spoilage' | 'damage' | 'expired' | 'count_correction' | null
      note: string | null
      createdByStaffId: string | null
      occurredAt?: Date
    },
  ): Promise<{ id: string }> {
    const row = await tx.stock_movement.create({
      data: {
        product_id: data.productId,
        warehouse_id: data.warehouseId ?? null,
        aircraft_id: data.aircraftId ?? null,
        stock_batch_id: data.stockBatchId ?? null,
        stock_transfer_id: data.stockTransferId ?? null,
        product_order_id: data.productOrderId ?? null,
        flight_id: data.flightId ?? null,
        type: data.type,
        quantity: data.quantity,
        reason: data.reason,
        note: data.note,
        created_by_staff_id: data.createdByStaffId,
        occurred_at: data.occurredAt ?? this.clock.now(),
      },
    })
    return { id: row.id }
  }

  private toDto = (row: {
    id: string
    product_id: string
    warehouse_id: string | null
    aircraft_id: string | null
    stock_batch_id: string | null
    stock_transfer_id: string | null
    product_order_id: string | null
    flight_id: string | null
    type: string
    quantity: number
    reason: string | null
    note: string | null
    created_by_staff_id: string | null
    occurred_at: Date
  }): StockMovementDto => ({
    id: row.id,
    productId: row.product_id,
    warehouseId: row.warehouse_id,
    aircraftId: row.aircraft_id,
    stockBatchId: row.stock_batch_id,
    stockTransferId: row.stock_transfer_id,
    productOrderId: row.product_order_id,
    flightId: row.flight_id,
    type: row.type,
    quantity: row.quantity,
    reason: row.reason,
    note: row.note,
    createdByStaffId: row.created_by_staff_id,
    occurredAt: row.occurred_at.toISOString(),
  })
}
