// SalesService: CRUD over product_sale. payment_id is opaque to F12
// (F5 owns payments). Total amount is quantity * unit_price_amount.
// Unit cost is filled in by the flight-report submit using the
// earliest-expiring valid aircraft batch.

import { Injectable } from '@nestjs/common'
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
    const flight = await this.db.flight.findUnique({ where: { id: flightId } })
    if (!flight) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
    const product = await this.db.product.findFirst({ where: { id: input.productId, deleted_at: null } })
    if (!product) throw new ApiErrorException('PRODUCT_NOT_OFFERED', 'Product not found.', 404)
    const onAircraft = await this.db.aircraft_stock.count({
      where: { aircraft_id: flight.aircraft_id, product_id: input.productId, quantity: { gt: 0 } },
    })
    if (onAircraft === 0) {
      throw new ApiErrorException('PRODUCT_NOT_OFFERED', 'Product is not loaded on the aircraft for this flight.', 409)
    }
    const paymentId = 'f5-confirmed' // F5 owns payments; F12 only stores the id.
    const now = new Date()
    const row = await this.db.product_sale.create({
      data: {
        flight_id: flightId,
        product_id: input.productId,
        quantity: input.quantity,
        unit_price_amount: input.unitPriceAmount,
        total_amount: input.quantity * input.unitPriceAmount,
        currency: 'USD',
        payment_id: paymentId,
        sold_at: now,
      },
      include: { product: true },
    })
    return this.toDto(row)
  }

  async update(saleId: string, patch: { quantity?: number; unitPriceAmount?: number }): Promise<ProductSaleDto> {
    const existing = await this.db.product_sale.findUnique({ where: { id: saleId }, include: { product: true } })
    if (!existing) throw new ApiErrorException('NOT_FOUND', 'Sale not found.', 404)
    const data: Record<string, number> = {}
    if (patch.quantity !== undefined) {
      if (!Number.isInteger(patch.quantity) || patch.quantity <= 0) {
        throw new ApiErrorException('REPORT_INVALID', 'quantity must be a positive integer.', 400)
      }
      data.quantity = patch.quantity
    }
    if (patch.unitPriceAmount !== undefined) {
      if (!Number.isFinite(patch.unitPriceAmount) || patch.unitPriceAmount < 0) {
        throw new ApiErrorException('REPORT_INVALID', 'unitPriceAmount must be 0 or more.', 400)
      }
      data.unit_price_amount = patch.unitPriceAmount
    }
    const newQty = data.quantity ?? existing.quantity
    const newPrice = data.unit_price_amount ?? Number(existing.unit_price_amount)
    data.total_amount = newQty * newPrice
    const row = await this.db.product_sale.update({ where: { id: saleId }, data, include: { product: true } })
    return this.toDto(row)
  }

  async delete(saleId: string): Promise<void> {
    const existing = await this.db.product_sale.findUnique({ where: { id: saleId } })
    if (!existing) throw new ApiErrorException('NOT_FOUND', 'Sale not found.', 404)
    await this.db.product_sale.delete({ where: { id: saleId } })
  }

  // Fills unit_cost_amount on every product_sale row for a flight,
  // using the earliest-expiring valid batch on the aircraft. Called
  // from flight-report.submit and from sales.update when the report
  // already exists.
  async fillUnitCosts(flightId: string, aircraftId: string): Promise<void> {
    const sales = await this.db.product_sale.findMany({ where: { flight_id: flightId } })
    for (const sale of sales) {
      const batch = await this.db.aircraft_stock.findFirst({
        where: { aircraft_id: aircraftId, product_id: sale.product_id, quantity: { gt: 0 } },
        include: { stock_batch: true },
        orderBy: [{ stock_batch: { expires_at: 'asc' } }],
      })
      let cost: number | null = null
      if (batch && !batch.stock_batch.is_damaged) {
        cost = Number(batch.stock_batch.unit_cost_amount)
      }
      if (cost == null) {
        const product = await this.db.product.findUnique({ where: { id: sale.product_id } })
        if (product?.purchase_cost_amount != null) cost = Number(product.purchase_cost_amount)
      }
      await this.db.product_sale.update({ where: { id: sale.id }, data: { unit_cost_amount: cost } })
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
