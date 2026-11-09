// POST /payment-events: F5 reports that a payment completed.
//
// The route is a service call, so it uses the global JWT guard (a
// Bearer token is required) but not the customer or staff guard: the
// caller is F5, not a signed-in person. The F12 exception filter still
// applies so the error envelope is the spec-mandated one.

import { Body, Controller, HttpCode, Post, UseFilters } from '@nestjs/common'
import { F12ExceptionFilter } from '../common/exception.filter'
import { PaymentEventsService } from './payment-events.service'

@Controller('payment-events')
@UseFilters(F12ExceptionFilter)
export class PaymentEventsController {
  constructor(private readonly events: PaymentEventsService) {}

  @Post()
  @HttpCode(200)
  async handle(@Body() body: unknown) {
    return this.events.handle(body)
  }
}
