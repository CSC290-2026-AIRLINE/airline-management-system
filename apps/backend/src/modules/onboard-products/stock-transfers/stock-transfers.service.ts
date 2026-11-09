// StockTransfersService: FEFO pull from the warehouse into the
// aircraft.
//
// Rules from the doc:
//   - the batch with the earliest expiry goes first;
//   - an expired or damaged batch is never transferred (BATCH_EXPIRED);
//   - a line the warehouse cannot cover is a STOCK_SHORTFALL;
//   - the transfer is safe to retry: the quantity already transferred
//     for the flight is subtracted first, so a second call moves
//     nothing and returns the transfers that already exist.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { AuditService } from '../common/audit.service'
import { SystemClock } from '../common/clock'

export interface StockTransferLineInput {
  productId: string
  quantity: number
}

export interface StockTransferDto {
  id: string
  flightId: string
  aircraftId: string
  warehouseId: string
  transferredAt: string
  staffId: string
  lines: Array<{ id: string; productId: string; stockBatchId: string; quantity: number }>
}

export interface TransferToAircraftInput {
  flightId: string
  aircraftId: string
  warehouseId: string
  lines: StockTransferLineInput[]
  staffId: string
  occurredAt: Date
}

@Injectable()
export class StockTransfersService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly clock: SystemClock,
  ) {}

  // The catering order's lines, moved to the aircraft. This is the
  // POST /staff/flights/:flightId/stock-transfers step; marking the
  // order loaded is a separate step.
  async transferCateringOrder(flightId: string, staffId: string): Promise<StockTransferDto[]> {
    const order = await this.db.catering_order.findUnique({
      where: { flight_id: flightId },
      include: { catering_order_line: true, flight: true },
    })
    if (!order) {
      throw new ApiErrorException('NOT_FOUND', 'Catering order not found. The job generates it at the cutoff.', 404)
    }
    if (order.status === 'loaded' || order.status === 'closed') {
      // Already transferred: the retry has nothing to do.
      return this.listByFlight(flightId)
    }
    if (order.catering_order_line.length === 0) return []
    const short = order.catering_order_line.find((l) => l.quantity_short > 0)
    if (short) {
      throw new ApiErrorException(
        'STOCK_SHORTFALL',
        `The order is short ${short.quantity_short} unit(s) of product ${short.product_id}.`,
        409,
        { product: short.product_id, short: short.quantity_short },
      )
    }

    const grouped = new Map<string, number>()
    for (const line of order.catering_order_line) {
      grouped.set(line.product_id, (grouped.get(line.product_id) ?? 0) + line.quantity_required)
    }
    const transfer = await this.transferToAircraft({
      flightId,
      aircraftId: order.flight.aircraft_id,
      warehouseId: order.warehouse_id,
      lines: [...grouped.entries()].map(([productId, quantity]) => ({ productId, quantity })),
      staffId,
      occurredAt: this.clock.now(),
    })
    return [transfer, ...(await this.listByFlight(flightId)).filter((t) => t.id !== transfer.id)]
  }

  // The main path: it takes a list of (product, quantity) pairs,
  // FEFO-picks the batches, and writes the transfer + aircraft_stock +
  // stock_movements atomically.
  async transferToAircraft(input: TransferToAircraftInput): Promise<StockTransferDto> {
    const already = await this.transferredQuantities(input.flightId)
    const pending = input.lines
      .map((line) => ({ productId: line.productId, quantity: Math.max(0, line.quantity - (already.get(line.productId) ?? 0)) }))
      .filter((line) => line.quantity > 0)

    // Everything the caller asked for is already on the aircraft:
    // the retry has nothing to move.
    if (pending.length === 0) {
      const existing = await this.listByFlight(input.flightId)
      if (existing.length > 0) return existing[0]
      throw new ApiErrorException('STOCK_SHORTFALL', 'There is nothing left to transfer for this flight.', 409)
    }

    return this.db.$transaction(async (tx) => {
      const transfer = await tx.stock_transfer.create({
        data: {
          flight_id: input.flightId,
          aircraft_id: input.aircraftId,
          warehouse_id: input.warehouseId,
          transferred_at: input.occurredAt,
          staff_id: input.staffId,
        },
      })
      const lineDtos: StockTransferDto['lines'] = []
      for (const line of pending) {
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
          throw new ApiErrorException('LINE_INVALID', 'quantity must be a positive integer.', 400)
        }
        const batches = await tx.stock_batch.findMany({
          where: { warehouse_id: input.warehouseId, product_id: line.productId, quantity_remaining: { gt: 0 } },
          orderBy: [{ expires_at: 'asc' }, { received_at: 'asc' }],
        })
        const usable = batches.filter((b) => !b.is_damaged && (b.expires_at == null || b.expires_at > input.occurredAt))
        if (usable.length === 0 && batches.length > 0) {
          const blocked = batches[0]
          throw new ApiErrorException(
            'BATCH_EXPIRED',
            blocked.is_damaged
              ? `The only batch of product ${line.productId} is damaged.`
              : `The only batch of product ${line.productId} expired on ${blocked.expires_at?.toISOString()}.`,
            409,
            {
              product: line.productId,
              batchId: blocked.id,
              reason: blocked.is_damaged ? 'damage' : 'expired',
            },
          )
        }
        let remaining = line.quantity
        for (const batch of usable) {
          if (remaining <= 0) break
          const take = Math.min(batch.quantity_remaining, remaining)
          await tx.stock_batch.update({
            where: { id: batch.id },
            data: { quantity_remaining: batch.quantity_remaining - take },
          })
          await tx.warehouse_stock.update({
            where: { warehouse_id_product_id: { warehouse_id: input.warehouseId, product_id: line.productId } },
            data: { quantity_on_hand: { decrement: take } },
          })
          // Upsert aircraft_stock (aircraft, batch) -> +take.
          await tx.aircraft_stock.upsert({
            where: { aircraft_id_stock_batch_id: { aircraft_id: input.aircraftId, stock_batch_id: batch.id } },
            create: { aircraft_id: input.aircraftId, product_id: line.productId, stock_batch_id: batch.id, quantity: take },
            update: { quantity: { increment: take } },
          })
          const stl = await tx.stock_transfer_line.create({
            data: { stock_transfer_id: transfer.id, stock_batch_id: batch.id, product_id: line.productId, quantity: take },
          })
          lineDtos.push({ id: stl.id, productId: line.productId, stockBatchId: batch.id, quantity: take })
          // Two stock_movement rows: one outbound at the warehouse, one
          // inbound on the aircraft. Same transfer_id, same product+batch.
          await tx.stock_movement.create({
            data: {
              product_id: line.productId,
              warehouse_id: input.warehouseId,
              stock_batch_id: batch.id,
              stock_transfer_id: transfer.id,
              flight_id: input.flightId,
              type: 'transfer',
              quantity: -take,
              reason: null,
              note: 'transfer to aircraft',
              created_by_staff_id: input.staffId,
              occurred_at: input.occurredAt,
            },
          })
          await tx.stock_movement.create({
            data: {
              product_id: line.productId,
              aircraft_id: input.aircraftId,
              stock_batch_id: batch.id,
              stock_transfer_id: transfer.id,
              flight_id: input.flightId,
              type: 'transfer',
              quantity: take,
              reason: null,
              note: 'transfer to aircraft',
              created_by_staff_id: input.staffId,
              occurred_at: input.occurredAt,
            },
          })
          remaining -= take
        }
        if (remaining > 0) {
          throw new ApiErrorException(
            'STOCK_SHORTFALL',
            `Only ${line.quantity - remaining} of ${line.quantity} available for product ${line.productId}.`,
            409,
            { product: line.productId, short: remaining },
          )
        }
      }
      await this.audit.record(
        {
          actorType: 'staff',
          actorId: input.staffId,
          actorRole: 'catering',
          sourceFeature: 'onboard-products',
          action: 'stock_transfer.to_aircraft',
          entityType: 'stock_transfer',
          entityId: transfer.id,
          summary: `Transferred ${lineDtos.length} line(s) to aircraft ${input.aircraftId} for flight ${input.flightId}.`,
        },
        tx,
      )
      return {
        id: transfer.id,
        flightId: transfer.flight_id,
        aircraftId: transfer.aircraft_id,
        warehouseId: transfer.warehouse_id,
        transferredAt: transfer.transferred_at.toISOString(),
        staffId: transfer.staff_id,
        lines: lineDtos,
      }
    })
  }

  async listByFlight(flightId: string): Promise<StockTransferDto[]> {
    const rows = await this.db.stock_transfer.findMany({
      where: { flight_id: flightId },
      include: { stock_transfer_line: true },
      orderBy: { transferred_at: 'desc' },
    })
    return rows.map((r) => ({
      id: r.id,
      flightId: r.flight_id,
      aircraftId: r.aircraft_id,
      warehouseId: r.warehouse_id,
      transferredAt: r.transferred_at.toISOString(),
      staffId: r.staff_id,
      lines: r.stock_transfer_line.map((l) => ({
        id: l.id,
        productId: l.product_id,
        stockBatchId: l.stock_batch_id,
        quantity: l.quantity,
      })),
    }))
  }

  // How much of every product already went to the aircraft for this
  // flight. It is what makes a retried transfer a no-op.
  private async transferredQuantities(flightId: string): Promise<Map<string, number>> {
    const lines = await this.db.stock_transfer_line.findMany({
      where: { stock_transfer: { flight_id: flightId } },
      select: { product_id: true, quantity: true },
    })
    const out = new Map<string, number>()
    for (const line of lines) {
      out.set(line.product_id, (out.get(line.product_id) ?? 0) + line.quantity)
    }
    return out
  }
}
