import { Module } from '@nestjs/common'
import { ProductOrdersModule } from '../product-orders/product-orders.module'
import { CatalogController } from './catalog.controller'

@Module({
  imports: [ProductOrdersModule],
  controllers: [CatalogController],
})
export class CatalogModule {}
