// Warehouses module: the airport list that drives the Stock page's
// airport picker. Each warehouse is bound to one airport (the
// partial unique on airport_code enforces this). DELETE refuses with
// WAREHOUSE_IN_USE if the warehouse has any stock, batches, or a
// catering order; the staff-web needs this to disable the trash icon
// on the Airport list dialog.

import { Module } from '@nestjs/common'
import { WarehousesController } from './warehouses.controller'
import { WarehousesService } from './warehouses.service'

@Module({
  controllers: [WarehousesController],
  providers: [WarehousesService],
  exports: [WarehousesService],
})
export class WarehousesModule {}
