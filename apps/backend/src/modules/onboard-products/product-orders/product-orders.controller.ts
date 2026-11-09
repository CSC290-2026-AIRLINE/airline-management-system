// Customer HTTP surface for the onboard shop orders.
// POST /product-orders          checkout
// GET  /product-orders          the caller's orders on a booking
// GET  /product-orders/:id      one order with its payment status
// DELETE /product-orders/:id    cancel before the cutoff

import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { CurrentCustomer } from '../common/customer.decorator'
import { CustomerAuth } from '../common/customer-auth.decorator'
import { ProductOrdersService } from './product-orders.service'

@Controller('product-orders')
@CustomerAuth()
export class ProductOrdersController {
  constructor(private readonly orders: ProductOrdersService) {}

  @Get()
  async list(@CurrentCustomer() customer: { id: string }, @Query('bookingId') bookingId?: string) {
    return this.orders.list(customer.id, bookingId)
  }

  @Get(':id')
  async get(@CurrentCustomer() customer: { id: string }, @Param('id') id: string) {
    return this.orders.get(customer.id, id)
  }

  @Post()
  @HttpCode(201)
  async checkout(@CurrentCustomer() customer: { id: string }, @Body() body: unknown) {
    return this.orders.checkout(customer.id, body)
  }

  @Delete(':id')
  async cancel(@CurrentCustomer() customer: { id: string }, @Param('id') id: string) {
    return this.orders.cancel(customer.id, id)
  }
}
