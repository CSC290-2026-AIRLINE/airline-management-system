// Suppliers module: per-airport supplier list, soft-deleted, with an
// in-use check (SUPPLIER_INVALID) that blocks deletion while purchase
// receipts reference it. Receive-delivery uses these to know which
// airport a supplier serves.

import { Module } from '@nestjs/common'
import { SuppliersController } from './suppliers.controller'
import { SuppliersService } from './suppliers.service'

@Module({
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
