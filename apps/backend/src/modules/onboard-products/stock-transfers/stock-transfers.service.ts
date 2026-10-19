// StockTransfersService: FEFO pull from the warehouse into the
// aircraft. BATCH_SHORT if the warehouse cannot cover a line;
// STOCK_SHORTFALL is the spec code for "partial fill accepted, but
// less than requested". Two stock_movement rows per line: a negative
// transfer row at the warehouse, a positive transfer row at the
// aircraft.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { AuditService } from '../common/audit.service'

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
  ) {}

  // The main path used by catering-orders.load: it takes a list of
  // (product, quantity) pairs, FEFO-picks batches, and writes the
  // transfer + aircraft_stock + stock_movements atomically.
  async transferToAircraft(input: TransferToAircraftInput): Promise<StockTransferDto> {
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
      for (const line of input.lines) {
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
          throw new ApiErrorException('LINE_INVALID', 'quantity must be a positive integer.', 400)
        }
        const batches = await tx.stock_batch.findMany({
          where: { warehouse_id: input.warehouseId, product_id: line.productId, quantity_remaining: { gt: 0 } },
          orderBy: [{ expires_at: 'asc' }, { received_at: 'asc' }],
        })
        let remaining = line.quantity
        for (const batch of batches) {
          if (remaining <= 0) break
          const take = Math.min(batch.quantity_remaining, remaining)
          await tx.stock_batch.update({ where: { id: batch.id }, data: { quantity_remaining: batch.quantity_remaining - take } })
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
}
