// The customer-facing catalog: the menu for a flight and cabin with
// the meal policy, the prices, the dietary badges, the stock status
// and the order window.

import { Controller, Get, Query } from '@nestjs/common'
import { CustomerAuth } from '../common/customer-auth.decorator'
import { ProductOrdersService } from '../product-orders/product-orders.service'

@Controller('catalog')
@CustomerAuth()
export class CatalogController {
  constructor(private readonly orders: ProductOrdersService) {}

  @Get()
  async catalog(@Query('bookingId') bookingId?: string, @Query('flightId') flightId?: string, @Query('cabin') cabin?: string) {
    return this.orders.catalog({ bookingId, flightId, cabin })
  }
}
