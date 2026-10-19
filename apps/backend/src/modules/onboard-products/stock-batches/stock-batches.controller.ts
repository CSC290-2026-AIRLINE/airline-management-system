import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiErrorException } from '../common/api-error'
import { CurrentStaff } from '../common/staff.decorator'
import type { StaffContext } from '../common/staff.guard'
import { StaffGuard } from '../common/staff.guard'
import { StockBatchesService } from './stock-batches.service'

@Controller('staff/stock-batches')
@UseGuards(StaffGuard)
export class StockBatchesController {
  constructor(private readonly batches: StockBatchesService) {}

  @Get()
  async list(
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('expiringBefore') expiringBefore?: string,
  ) {
    let expiringBeforeDate: Date | undefined
    if (expiringBefore) {
      const t = Date.parse(expiringBefore)
      if (Number.isNaN(t)) throw new ApiErrorException('LINE_INVALID', 'expiringBefore must be ISO date.', 400)
      expiringBeforeDate = new Date(t)
    }
    return this.batches.list({
      ...(warehouseId ? { warehouseId } : {}),
      ...(productId ? { productId } : {}),
      ...(expiringBeforeDate ? { expiringBefore: expiringBeforeDate } : {}),
    })
  }

  @Put('write-off-expired')
  @Post('write-off-expired')
  async writeOff(@Query('warehouseId') warehouseId: string | undefined, @Body() body: unknown, @CurrentStaff() staff: StaffContext) {
    const filter: { warehouseId?: string; productId?: string } = {}
    if (warehouseId) filter.warehouseId = warehouseId
    if (typeof body === 'object' && body !== null) {
      const b = body as Record<string, unknown>
      if (typeof b.productId === 'string') filter.productId = b.productId
    }
    return this.batches.writeOffExpired(filter, staff.id)
  }
}
