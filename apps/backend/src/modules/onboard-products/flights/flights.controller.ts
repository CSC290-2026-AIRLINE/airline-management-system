// The flight-scoped staff routes. Everything that hangs off one
// flight lives here, so the URLs match the Iteration-02 API table:
//
//   GET  /staff/flights/:flightId/catering-order
//   POST /staff/flights/:flightId/catering-order
//   PUT  /staff/flights/:flightId/catering-order/loaded
//   POST /staff/flights/:flightId/stock-transfers
//   GET  /staff/flights/:flightId/flight-report
//   PUT  /staff/flights/:flightId/flight-report
//   GET  /staff/flights/:flightId/sales
//   POST /staff/flights/:flightId/sales
//   PUT  /staff/flights/:flightId/sales/:saleId
//   DELETE /staff/flights/:flightId/sales/:saleId
//   GET  /staff/flights/:flightId/cabin-settings
//
// Creates are POST, edits are PUT, and there is no PATCH.

import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { ApiErrorException } from '../common/api-error'
import { StaffAuth } from '../common/staff-auth.decorator'
import { CurrentStaff } from '../common/staff.decorator'
import type { StaffContext } from '../common/staff.guard'
import { CabinSettingsService } from '../cabin-settings/cabin-settings.service'
import { CateringOrdersService } from '../catering-orders/catering-orders.service'
import { FlightReportService, type SubmitFlightReportInput } from '../flight-report/flight-report.service'
import { SalesService } from '../sales/sales.service'
import { StockTransfersService } from '../stock-transfers/stock-transfers.service'

// The lines of a flight report: what was served, wasted and damaged.
function parseReportInput(body: unknown): SubmitFlightReportInput {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('REPORT_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.lines)) throw new ApiErrorException('REPORT_INVALID', 'lines is required.', 400)
  const lines = b.lines.map((l, i) => {
    if (typeof l !== 'object' || l === null) {
      throw new ApiErrorException('REPORT_INVALID', `lines[${i}] must be an object.`, 400)
    }
    const obj = l as Record<string, unknown>
    if (typeof obj.productId !== 'string') {
      throw new ApiErrorException('REPORT_INVALID', `lines[${i}].productId is required.`, 400)
    }
    if (typeof obj.served !== 'number' || typeof obj.wasted !== 'number' || typeof obj.damaged !== 'number') {
      throw new ApiErrorException('REPORT_INVALID', `lines[${i}].served/wasted/damaged must be numbers.`, 400)
    }
    return { productId: obj.productId, served: obj.served, wasted: obj.wasted, damaged: obj.damaged }
  })
  return { lines }
}

// One on-board sale: a product, how many and at what price.
function parseSaleInput(body: unknown): { productId: string; quantity: number; unitPriceAmount: number } {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('REPORT_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  if (typeof b.productId !== 'string') throw new ApiErrorException('REPORT_INVALID', 'productId is required.', 400)
  if (typeof b.quantity !== 'number') throw new ApiErrorException('REPORT_INVALID', 'quantity is required.', 400)
  if (typeof b.unitPriceAmount !== 'number') {
    throw new ApiErrorException('REPORT_INVALID', 'unitPriceAmount is required.', 400)
  }
  return { productId: b.productId, quantity: b.quantity, unitPriceAmount: b.unitPriceAmount }
}

// The patch of a recorded sale: the quantity and the selling price.
function parseSalePatch(body: unknown): { quantity?: number; unitPriceAmount?: number } {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('REPORT_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  const patch: { quantity?: number; unitPriceAmount?: number } = {}
  if (b.quantity !== undefined) {
    if (typeof b.quantity !== 'number') throw new ApiErrorException('REPORT_INVALID', 'quantity must be a number.', 400)
    patch.quantity = b.quantity
  }
  if (b.unitPriceAmount !== undefined) {
    if (typeof b.unitPriceAmount !== 'number') {
      throw new ApiErrorException('REPORT_INVALID', 'unitPriceAmount must be a number.', 400)
    }
    patch.unitPriceAmount = b.unitPriceAmount
  }
  return patch
}

@Controller('staff/flights/:flightId')
@StaffAuth()
export class FlightsController {
  constructor(
    private readonly cateringOrders: CateringOrdersService,
    private readonly transfers: StockTransfersService,
    private readonly reports: FlightReportService,
    private readonly sales: SalesService,
    private readonly cabinSettings: CabinSettingsService,
  ) {}

  // The catering order of this flight: required, available and short
  // quantities per line.
  @Get('catering-order')
  async getCateringOrder(@Param('flightId') flightId: string) {
    return this.cateringOrders.get(flightId)
  }

  // Refresh the order against the current stock. The order is
  // generated at the cutoff, so a refresh before it is refused with
  // ORDER_NOT_YET_DUE. It is idempotent.
  @Post('catering-order')
  async refreshCateringOrder(@Param('flightId') flightId: string, @CurrentStaff() staff: StaffContext) {
    return this.cateringOrders.refresh(flightId, staff.id)
  }

  // Mark the order loaded, after the stock transfer.
  @Put('catering-order/loaded')
  async markCateringOrderLoaded(@Param('flightId') flightId: string, @CurrentStaff() staff: StaffContext) {
    return this.cateringOrders.markLoaded(flightId, staff.id)
  }

  // Move the stock from the warehouse to the aircraft, earliest
  // expiry first. Safe to retry: the quantity already transferred is
  // subtracted first.
  @Post('stock-transfers')
  async transferStock(@Param('flightId') flightId: string, @CurrentStaff() staff: StaffContext) {
    return this.transfers.transferCateringOrder(flightId, staff.id)
  }

  // The flight report, with the served, sold, wasted and damaged
  // quantities per line.
  @Get('flight-report')
  async getFlightReport(@Param('flightId') flightId: string) {
    const report = await this.reports.getByFlight(flightId)
    return report ?? null
  }

  // Submit the flight report. It applies the completion rules and
  // closes the catering order.
  @Put('flight-report')
  async submitFlightReport(@Param('flightId') flightId: string, @Body() body: unknown, @CurrentStaff() staff: StaffContext) {
    return this.reports.submit(flightId, parseReportInput(body), staff.id)
  }

  // The on-board sales of this flight.
  @Get('sales')
  async listSales(@Param('flightId') flightId: string) {
    return this.sales.listByFlight(flightId)
  }

  // Record an on-board sale, once F5 confirmed the payment.
  @Post('sales')
  async createSale(@Param('flightId') flightId: string, @Body() body: unknown) {
    return this.sales.create(flightId, parseSaleInput(body))
  }

  // Edit a recorded sale: the quantity and the selling price.
  @Put('sales/:saleId')
  async updateSale(@Param('flightId') flightId: string, @Param('saleId') saleId: string, @Body() body: unknown) {
    return this.sales.update(flightId, saleId, parseSalePatch(body))
  }

  // Remove a recorded sale.
  @Delete('sales/:saleId')
  async deleteSale(@Param('flightId') flightId: string, @Param('saleId') saleId: string) {
    await this.sales.delete(flightId, saleId)
    return null
  }

  // The resolved settings of every cabin on this flight.
  @Get('cabin-settings')
  async getCabinSettings(@Param('flightId') flightId: string) {
    return this.cabinSettings.resolveAllForFlight(flightId)
  }
}
