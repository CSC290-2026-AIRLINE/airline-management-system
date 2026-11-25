// On-board sales are constrained by the stock transferred for the selected flight.

import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import type { Prisma } from '../../../db/generated/prisma/client'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { toNumber } from '../common/mapping'

export interface ProductSaleDto {
  id: string
  flightId: string
  productId: string
  productName: string
  quantity: number
  unitPriceAmount: number
  unitCostAmount: number | null
  totalAmount: number
  currency: string
  paymentId: string
  soldAt: string
}

@Injectable()
export class SalesService {
  constructor(private readonly db: DbService) {}

  async listByFlight(flightId: string): Promise<ProductSaleDto[]> {
    const rows = await this.db.product_sale.findMany({
      where: { flight_id: flightId },
      include: { product: true },
      orderBy: { sold_at: 'asc' },
    })
    return rows.map(this.toDto)
  }

  async create(flightId: string, input: { productId: string; quantity: number; unitPriceAmount: number }): Promise<ProductSaleDto> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new ApiErrorException('REPORT_INVALID', 'quantity must be a positive integer.', 400)
    }
    if (!Number.isFinite(input.unitPriceAmount) || input.unitPriceAmount < 0) {
      throw new ApiErrorException('REPORT_INVALID', 'unitPriceAmount must be 0 or more.', 400)
    }
    return this.db.$transaction(async (tx) => {
      await this.lockSaleFlight(tx, flightId)
      const product = await tx.product.findFirst({ where: { id: input.productId, deleted_at: null } })
      if (!product) throw new ApiErrorException('PRODUCT_NOT_OFFERED', 'Product not found.', 404)
      await this.assertSaleCapacity(tx, flightId, input.productId, input.quantity)
      const total = input.quantity * input.unitPriceAmount
      const row = await tx.product_sale.create({
        data: {
          flight_id: flightId,
          product_id: input.productId,
          quantity: input.quantity,
          unit_price_amount: input.unitPriceAmount,
          total_amount: total,
          currency: 'USD',
          payment_id: randomUUID(), // Local payment reference until F5 is wired into sales.
          sold_at: new Date(),
        },
        include: { product: true },
      })
      return this.toDto(row)
    })
  }

  async update(flightId: string, saleId: string, patch: { quantity?: number; unitPriceAmount?: number }): Promise<ProductSaleDto> {
    if (patch.quantity !== undefined && (!Number.isInteger(patch.quantity) || patch.quantity <= 0)) {
      throw new ApiErrorException('REPORT_INVALID', 'quantity must be a positive integer.', 400)
    }
    if (patch.unitPriceAmount !== undefined && (!Number.isFinite(patch.unitPriceAmount) || patch.unitPriceAmount < 0)) {
      throw new ApiErrorException('REPORT_INVALID', 'unitPriceAmount must be 0 or more.', 400)
    }
    return this.db.$transaction(async (tx) => {
      await this.lockSaleFlight(tx, flightId)
      const existing = await tx.product_sale.findFirst({ where: { id: saleId, flight_id: flightId } })
      if (!existing) throw new ApiErrorException('NOT_FOUND', 'Sale not found.', 404)
      const quantity = patch.quantity ?? existing.quantity
      const unitPrice = patch.unitPriceAmount ?? Number(existing.unit_price_amount)
      await this.assertSaleCapacity(tx, flightId, existing.product_id, quantity, saleId)
      const row = await tx.product_sale.update({
        where: { id: saleId },
        data: { quantity, unit_price_amount: unitPrice, total_amount: quantity * unitPrice },
        include: { product: true },
      })
      return this.toDto(row)
    })
  }

  async delete(flightId: string, saleId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await this.lockSaleFlight(tx, flightId)
      const deleted = await tx.product_sale.deleteMany({ where: { id: saleId, flight_id: flightId } })
      if (!deleted.count) throw new ApiErrorException('NOT_FOUND', 'Sale not found.', 404)
    })
  }

  private async lockSaleFlight(tx: Prisma.TransactionClient, flightId: string): Promise<void> {
    const flights = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM flight WHERE id = ${flightId}::uuid FOR UPDATE`
    if (!flights.length) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
    const order = await tx.catering_order.findUnique({ where: { flight_id: flightId } })
    if (order?.status !== 'loaded') {
      throw new ApiErrorException('REPORT_INVALID', 'Sales can only be changed while the catering order is loaded.', 409)
    }
  }

  private async assertSaleCapacity(
    tx: Prisma.TransactionClient,
    flightId: string,
    productId: string,
    quantity: number,
    excludingSaleId?: string,
  ): Promise<void> {
    const load = await tx.stock_transfer_line.aggregate({
      where: { product_id: productId, stock_transfer: { flight_id: flightId } },
      _sum: { quantity: true },
    })
    const count = load._sum.quantity ?? 0
    if (count === 0) throw new ApiErrorException('PRODUCT_NOT_OFFERED', 'Product was not loaded for this flight.', 409)
    const sales = await tx.product_sale.aggregate({
      where: { flight_id: flightId, product_id: productId, ...(excludingSaleId ? { id: { not: excludingSaleId } } : {}) },
      _sum: { quantity: true },
    })
    if ((sales._sum.quantity ?? 0) + quantity > count) {
      throw new ApiErrorException('OUT_OF_STOCK', 'Quantity exceeds the unsold stock loaded for this flight.', 409)
    }
  }

  private toDto = (row: {
    id: string
    flight_id: string
    product_id: string
    product: { name: string }
    quantity: number
    unit_price_amount: { toNumber: () => number } | number | string
    unit_cost_amount: { toNumber: () => number } | number | string | null
    total_amount: { toNumber: () => number } | number | string
    currency: string
    payment_id: string
    sold_at: Date
  }): ProductSaleDto => ({
    id: row.id,
    flightId: row.flight_id,
    productId: row.product_id,
    productName: row.product.name,
    quantity: row.quantity,
    unitPriceAmount: toNumber(row.unit_price_amount),
    unitCostAmount: row.unit_cost_amount == null ? null : toNumber(row.unit_cost_amount),
    totalAmount: toNumber(row.total_amount),
    currency: row.currency,
    paymentId: row.payment_id,
    soldAt: row.sold_at.toISOString(),
  })
}
