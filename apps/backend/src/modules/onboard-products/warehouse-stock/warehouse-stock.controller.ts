// The stock of a warehouse, per product: on hand, reserved, available
// and the reorder level.
//
//   GET /staff/warehouse-stock?warehouseId=&lowOnly=

import { Controller, Get, Query } from '@nestjs/common'
import { StaffAuth } from '../common/staff-auth.decorator'
import { WarehouseStockService } from './warehouse-stock.service'

@Controller('staff/warehouse-stock')
@StaffAuth()
export class WarehouseStockController {
  constructor(private readonly stock: WarehouseStockService) {}

  @Get()
  async list(@Query('warehouseId') warehouseId?: string, @Query('lowOnly') lowOnly?: string) {
    return this.stock.list(warehouseId, lowOnly === 'true' || lowOnly === '1')
  }
}
