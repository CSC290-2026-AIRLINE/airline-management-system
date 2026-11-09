// ReservationsService: holds and releases warehouse stock for a
// customer order.
//
// Two rules from the doc drive the shape of this service:
//   - a reservation only counts stock that is actually available
//     (on hand minus reserved), so the reserve is one conditional
//     UPDATE ... WHERE quantity_on_hand - quantity_reserved >= n;
//   - a retried reserve or release cannot be recorded twice, so the
//     append-only stock_movement row is written first and its unique
//     index on (product_order_id, product_id, type) is what makes the
//     call idempotent.
//
// Every method takes a transaction client so the caller can commit the
// order change and the stock change together.

import { Injectable } from '@nestjs/common'
import type { Prisma } from '../../../db/generated/prisma/client'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'

export type ReservationTx = Prisma.TransactionClient

export interface ReservationArgs {
  warehouseId: string
  productId: string
  quantity: number
  orderId: string
  flightId: string
  occurredAt: Date
  productName?: string
}

@Injectable()
export class ReservationsService {
  constructor(private readonly db: DbService) {}

  // Holds `quantity` units for the order. Throws OUT_OF_STOCK when the
  // warehouse cannot cover it. Returns false when the order already
  // holds this stock (a retried call).
  async reserve(tx: ReservationTx, args: ReservationArgs): Promise<boolean> {
    if (!Number.isInteger(args.quantity) || args.quantity <= 0) {
      throw new ApiErrorException('LINE_INVALID', 'quantity must be a positive integer.', 400)
    }
    // The movement goes first: its unique index
    // (product_order_id, product_id, type) is the idempotency guard,
    // and a P2002 here means the reservation already exists.
    try {
      await tx.stock_movement.create({
        data: {
          product_id: args.productId,
          warehouse_id: args.warehouseId,
          product_order_id: args.orderId,
          flight_id: args.flightId,
          type: 'reserve',
          quantity: -args.quantity,
          reason: null,
          note: 'reserved for customer order',
          created_by_staff_id: null,
          occurred_at: args.occurredAt,
        },
      })
    } catch (err) {
      if (isUniqueViolation(err)) return false
      throw err
    }

    // One conditional update: the reservation only succeeds when the
    // warehouse has enough unreserved stock.
    const updated = await tx.$executeRaw`
      UPDATE warehouse_stock
      SET quantity_reserved = quantity_reserved + ${args.quantity}, updated_at = now()
      WHERE warehouse_id = ${args.warehouseId}::uuid
        AND product_id = ${args.productId}::uuid
        AND quantity_on_hand - quantity_reserved >= ${args.quantity}
    `
    if (Number(updated) === 0) {
      const stock = await tx.warehouse_stock.findUnique({
        where: { warehouse_id_product_id: { warehouse_id: args.warehouseId, product_id: args.productId } },
      })
      const available = stock ? stock.quantity_on_hand - stock.quantity_reserved : 0
      throw new ApiErrorException('OUT_OF_STOCK', `Not enough stock for ${args.productName ?? args.productId}.`, 409, {
        product: args.productId,
        available,
      })
    }
    return true
  }

  // Gives the stock back. Returns false when it was already released.
  async release(tx: ReservationTx, args: ReservationArgs): Promise<boolean> {
    if (!Number.isInteger(args.quantity) || args.quantity <= 0) {
      throw new ApiErrorException('LINE_INVALID', 'quantity must be a positive integer.', 400)
    }
    try {
      await tx.stock_movement.create({
        data: {
          product_id: args.productId,
          warehouse_id: args.warehouseId,
          product_order_id: args.orderId,
          flight_id: args.flightId,
          type: 'release',
          quantity: args.quantity,
          reason: null,
          note: 'released from customer order',
          created_by_staff_id: null,
          occurred_at: args.occurredAt,
        },
      })
    } catch (err) {
      if (isUniqueViolation(err)) return false
      throw err
    }
    await tx.$executeRaw`
      UPDATE warehouse_stock
      SET quantity_reserved = GREATEST(quantity_reserved - ${args.quantity}, 0), updated_at = now()
      WHERE warehouse_id = ${args.warehouseId}::uuid
        AND product_id = ${args.productId}::uuid
    `
    return true
  }

  // How much of a product the warehouse can still promise at a flight's
  // departure airport.
  async availableAt(warehouseId: string, productId: string): Promise<number> {
    const stock = await this.db.warehouse_stock.findUnique({
      where: { warehouse_id_product_id: { warehouse_id: warehouseId, product_id: productId } },
    })
    if (!stock) return 0
    return stock.quantity_on_hand - stock.quantity_reserved
  }
}

// Prisma's unique-constraint error. The generated client re-exports it
// as Prisma.PrismaClientKnownRequestError with code P2002.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
}
