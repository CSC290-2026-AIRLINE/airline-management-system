import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiErrorException } from '../common/api-error'
import { CurrentStaff } from '../common/staff.decorator'
import type { StaffContext } from '../common/staff.guard'
import { StaffGuard } from '../common/staff.guard'
import { StockMovementsService, type AdjustStockInput } from './stock-movements.service'

const REASONS = ['spoilage', 'damage', 'expired', 'count_correction'] as const

function parseInput(body: unknown): AdjustStockInput {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('ADJUST_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  if (typeof b.warehouseId !== 'string') throw new ApiErrorException('ADJUST_INVALID', 'warehouseId is required.', 400)
  if (typeof b.productId !== 'string') throw new ApiErrorException('ADJUST_INVALID', 'productId is required.', 400)
  if (typeof b.quantity !== 'number') throw new ApiErrorException('ADJUST_INVALID', 'quantity is required.', 400)
  if (typeof b.reason !== 'string' || !(REASONS as readonly string[]).includes(b.reason)) {
    throw new ApiErrorException('REASON_REQUIRED', 'reason must be spoilage, damage, expired or count_correction.', 400)
  }
  const note = typeof b.note === 'string' ? b.note : null
  return {
    warehouseId: b.warehouseId,
    productId: b.productId,
    quantity: b.quantity,
    reason: b.reason as AdjustStockInput['reason'],
    note,
  }
}

@Controller('staff/stock-movements')
@UseGuards(StaffGuard)
export class StockMovementsController {
  constructor(private readonly movements: StockMovementsService) {}

  @Get()
  async list(
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('flightId') flightId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.movements.list({
      ...(warehouseId ? { warehouseId } : {}),
      ...(productId ? { productId } : {}),
      ...(flightId ? { flightId } : {}),
      ...(limit ? { limit: Number(limit) || undefined } : {}),
    })
  }

  // Spec: PUT only. POST is the synonym used by the staff-web's
  // createStockMovement helper for the Adjust-stock dialog.
  @Put()
  @Post()
  async adjust(@Body() body: unknown, @CurrentStaff() staff: StaffContext) {
    return this.movements.adjust(parseInput(body), staff.id)
  }
}
