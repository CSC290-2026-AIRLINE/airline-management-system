import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiErrorException } from '../common/api-error'
import { StaffGuard } from '../common/staff.guard'
import { SalesService } from './sales.service'

function parseCreate(body: unknown): { productId: string; quantity: number; unitPriceAmount: number } {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('REPORT_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  if (typeof b.productId !== 'string') throw new ApiErrorException('REPORT_INVALID', 'productId is required.', 400)
  if (typeof b.quantity !== 'number') throw new ApiErrorException('REPORT_INVALID', 'quantity is required.', 400)
  if (typeof b.unitPriceAmount !== 'number') throw new ApiErrorException('REPORT_INVALID', 'unitPriceAmount is required.', 400)
  return { productId: b.productId, quantity: b.quantity, unitPriceAmount: b.unitPriceAmount }
}

function parsePatch(body: unknown): { quantity?: number; unitPriceAmount?: number } {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('REPORT_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  const out: { quantity?: number; unitPriceAmount?: number } = {}
  if (b.quantity !== undefined) {
    if (typeof b.quantity !== 'number') throw new ApiErrorException('REPORT_INVALID', 'quantity must be a number.', 400)
    out.quantity = b.quantity
  }
  if (b.unitPriceAmount !== undefined) {
    if (typeof b.unitPriceAmount !== 'number') throw new ApiErrorException('REPORT_INVALID', 'unitPriceAmount must be a number.', 400)
    out.unitPriceAmount = b.unitPriceAmount
  }
  return out
}

@Controller('staff/sales')
@UseGuards(StaffGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('flight/:flightId')
  async listByFlight(@Param('flightId') flightId: string) {
    return this.sales.listByFlight(flightId)
  }

  // Spec: PUT only. POST is the synonym used by the staff-web's
  // createFlightSale helper.
  @Put('flight/:flightId')
  @Post('flight/:flightId')
  async create(@Param('flightId') flightId: string, @Body() body: unknown) {
    return this.sales.create(flightId, parseCreate(body))
  }

  @Put(':saleId')
  async update(@Param('saleId') saleId: string, @Body() body: unknown) {
    return this.sales.update(saleId, parsePatch(body))
  }

  @Delete(':saleId')
  @HttpCode(204)
  async remove(@Param('saleId') saleId: string) {
    await this.sales.delete(saleId)
  }
}
